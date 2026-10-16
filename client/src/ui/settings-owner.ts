// Grupo "Dono do escritório" das configurações: o nome, o cargo e o look do dono e da secretária. Com um dono, o campus
// do escritório combinado ganha a diretoria (client/src/world/layout/ceo.ts). Grava no servidor (PUT /api/owner,
// server/owner.ts: <dataDir>/owner.json); nome vazio (ou "Remover") tira o dono. As peças da aparência (`parts`) não
// são editadas aqui: vêm do HABBLAUD_OWNER ou da API e são mantidas ao salvar (assim como `smokes`).
import type { OwnerInfo } from '../../../shared/types';
import { access } from '../net/access';
import type { UiContext } from './context';
import { h, setAttr, setHidden, setText } from './dom';
import { tr } from '../../../shared/i18n';
import { NAME_MAX } from '../../../shared/appearance';

type Look = 'f' | 'm';

/** Dá para mudar o dono daqui? A mesma regra de renomear salas: página local, trava do terminal, servidor de verdade. */
export function canEditOwner(ctx: UiContext): boolean {
  return !ctx.store.mock && !ctx.store.replaying && !!ctx.store.snapshot?.meta.terminal && access().local;
}

/** Corpo do PUT a partir do formulário, mantendo as peças que já existiam (as do dono e as da secretária). */
export function ownerBody(form: { name: string; title: string; look: Look; secName: string; secLook: Look }, current: OwnerInfo | undefined): Record<string, unknown> {
  const name = form.name.trim();
  if (!name) return { name: '' };
  const secName = form.secName.trim();
  return {
    name,
    ...(form.title.trim() ? { title: form.title.trim() } : {}),
    look: form.look,
    ...(current?.parts ? { parts: current.parts } : {}),
    ...(current?.smokes ? { smokes: true } : {}),
    ...(secName ? { secretary: { name: secName, look: form.secLook, ...(current?.secretary?.parts ? { parts: current.secretary.parts } : {}) } } : {}),
  };
}

function lookPicker(label: string, onPick: (v: Look) => void): { row: HTMLElement; buttons: HTMLButtonElement[]; set(v: Look): void } {
  const options: [Look, string][] = [
    ['m', tr('Masculino')],
    ['f', tr('Feminino')],
  ];
  const group = h('div', { class: 'ui-seg', role: 'radiogroup', attrs: { 'aria-label': label } });
  const buttons = options.map(([v, text]) => {
    const b = h('button', { class: 'ui-seg__opt', type: 'button', role: 'radio', text, attrs: { 'aria-checked': 'false' } });
    b.addEventListener('click', () => onPick(v));
    b.addEventListener('keydown', (e) => {
      // Setas trocam a opção (padrão de radiogroup).
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      e.stopPropagation();
      const i = options.findIndex(([o]) => o !== v);
      onPick(options[i][0]);
      buttons[i].focus();
    });
    group.append(b);
    return b;
  });
  return {
    row: h('div', { class: 'ui-set ui-owner__look' }, h('span', { class: 'ui-set__label', text: label }), group),
    buttons,
    set(v) {
      options.forEach(([o], i) => {
        setAttr(buttons[i], 'aria-checked', String(o === v));
        buttons[i].tabIndex = o === v ? 0 : -1;
      });
    },
  };
}

export class OwnerSettingsGroup {
  readonly el: HTMLElement;
  private readonly name: HTMLInputElement;
  private readonly title: HTMLInputElement;
  private readonly secName: HTMLInputElement;
  private readonly look: ReturnType<typeof lookPicker>;
  private readonly secLook: ReturnType<typeof lookPicker>;
  private readonly saveBtn: HTMLButtonElement;
  private readonly clearBtn: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly error: HTMLElement;
  private lookV: Look = 'm';
  private secLookV: Look = 'f';
  private busy = false;

  constructor(private ctx: UiContext) {
    const input = (label: string, placeholder = '') =>
      h('input', { class: 'ui-owner__input', type: 'text', attrs: { maxlength: NAME_MAX, autocomplete: 'off', spellcheck: 'false', placeholder, 'aria-label': label } });
    const field = (label: string, el: HTMLInputElement) => h('label', { class: 'ui-owner__field' }, h('span', { class: 'ui-set__label', text: label }), el);
    this.name = input(tr('Nome do dono'));
    this.title = input(tr('Cargo'), 'CEO');
    this.secName = input(tr('Nome da secretária'));
    this.look = lookPicker(tr('Look do dono'), (v) => this.pickLook(v));
    this.secLook = lookPicker(tr('Look da secretária'), (v) => this.pickSecLook(v));
    this.saveBtn = h('button', { class: 'ui-btn ui-btn--primary ui-btn--sm', type: 'button', text: tr('Salvar'), on: { click: () => void this.save() } }) as HTMLButtonElement;
    this.clearBtn = h('button', { class: 'ui-link-btn', type: 'button', text: tr('Remover o dono'), on: { click: () => void this.save(true) } }) as HTMLButtonElement;
    this.hint = h('p', { class: 'ui-set__hint' });
    this.error = h('p', { class: 'ui-owner__error', role: 'alert', hidden: true });
    for (const el of [this.name, this.title, this.secName]) {
      el.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') {
          ev.preventDefault();
          void this.save();
        }
      });
      el.addEventListener('keyup', (ev) => ev.stopPropagation());
    }
    this.el = h(
      'div',
      { class: 'ui-set-group ui-owner' },
      h('h3', { text: tr('Dono do escritório') }),
      h('p', { class: 'ui-set__hint', text: tr('No escritório combinado (2+ computadores), o campus ganha a diretoria: a sala do dono e a secretária na antessala. Nome vazio tira a diretoria.') }),
      h('div', { class: 'ui-owner__grid' }, field(tr('Nome'), this.name), field(tr('Cargo'), this.title)),
      this.look.row,
      field(tr('Secretária (opcional)'), this.secName),
      this.secLook.row,
      this.error,
      h('div', { class: 'ui-owner__actions' }, this.saveBtn, this.clearBtn),
      this.hint,
    );
  }

  /** Ao abrir as configurações: o formulário volta ao dono em uso (o do snapshot). */
  load(): void {
    const o = this.current();
    this.name.value = o?.name ?? '';
    this.title.value = o?.title ?? '';
    this.secName.value = o?.secretary?.name ?? '';
    this.pickLook(o?.look ?? 'm');
    this.pickSecLook(o?.secretary?.look ?? 'f');
    this.showError(null);
    this.render();
  }

  render(): void {
    const editable = canEditOwner(this.ctx);
    for (const el of [this.name, this.title, this.secName, this.saveBtn, this.clearBtn, ...this.look.buttons, ...this.secLook.buttons]) el.disabled = !editable || this.busy;
    setHidden(this.clearBtn, !this.current());
    setText(
      this.hint,
      editable
        ? tr('A aparência (peças) do dono e da secretária vem do HABBLAUD_OWNER ou da API (PUT /api/owner) e fica como está ao salvar.')
        : this.ctx.store.mock
          ? tr('No modo mock não há servidor para gravar (use &owner=1 na URL para ver a diretoria).')
          : tr('Só pelo próprio computador (http://localhost), com o Habblaud acessível apenas por ele.'),
    );
  }

  private current(): OwnerInfo | undefined {
    return this.ctx.store.snapshot?.meta.owner;
  }

  private pickLook(v: Look): void {
    this.lookV = v;
    this.look.set(v);
  }

  private pickSecLook(v: Look): void {
    this.secLookV = v;
    this.secLook.set(v);
  }

  private showError(message: string | null): void {
    setText(this.error, message ?? '');
    setHidden(this.error, !message);
  }

  private async save(clear = false): Promise<void> {
    if (this.busy || !canEditOwner(this.ctx)) return;
    const body = clear ? { name: '' } : ownerBody({ name: this.name.value, title: this.title.value, look: this.lookV, secName: this.secName.value, secLook: this.secLookV }, this.current());
    this.busy = true;
    this.showError(null);
    this.render();
    try {
      const res = await fetch('/api/owner', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = (await res.json().catch(() => ({}))) as { owner?: OwnerInfo | null; error?: string };
      if (!res.ok) return this.showError(out.error ?? tr('erro {0}', [res.status]));
      if (out.owner) {
        this.name.value = out.owner.name;
        this.ctx.announce(tr('Dono do escritório salvo: {0}.', [out.owner.name]));
      } else {
        this.name.value = '';
        this.title.value = '';
        this.secName.value = '';
        this.ctx.announce(tr('Sem dono: a diretoria saiu do campus.'));
      }
    } catch {
      this.showError(tr('o Habblaud não respondeu'));
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
