// Menu "Atividades" (megafone na barra superior, tecla A): manda todos os agentes livres para a mesma atividade de
// uma vez — chamado para a oração (campus, primeiro da lista), chai, TV, pingue-pongue, tênis, soneca, cigarro,
// passeio ou de volta às mesas. Quem decide quem vai é o mundo (world.sendAll; ver world/sim/send-all.ts); aqui ficam
// o popover, o aviso com o resultado ("🕌 Chamado para a oração: 7 a caminho da mesquita · 3 ocupados ficaram") e as
// regras de quando o menu vale (fora do timelapse e da demonstração). O texto do aviso e a disponibilidade são puros
// e testados em ui/activities.test.ts.
import type { PrayerName } from '../../../shared/prayer-times';
import { prayerLabel } from './settings-mosque';
import type { SendActivity, SendActivityInfo, SendAllResult } from '../world/api';
import type { UiComponent, UiContext } from './context';
import { h, iconButton, setAttr, setTitle } from './dom';
import { ICONS } from './icons';
import { tr } from '../../../shared/i18n';

/** Fechou (clique fora) há tão pouco que o mesmo clique no botão não deve reabrir. */
const REOPEN_GUARD_MS = 250;

// ---------------------------------------------------------------- modelo (puro)

/** O que cada atividade diz de quem foi ("7 a caminho da mesquita") e de quem só assiste/cochila. */
const GOING: Readonly<Record<SendActivity, string>> = {
  prayer: tr('{0} a caminho da mesquita'),
  chai: tr('{0} indo tomar chai'),
  tv: tr('{0} indo ver TV'),
  pingpong: tr('{0} jogando'),
  tennis: tr('{0} jogando'),
  nap: tr('{0} indo dormir'),
  smoke: tr('{0} indo fumar'),
  walk: tr('{0} saindo para passear'),
  desk: tr('{0} voltando para a mesa'),
};
const EXTRA: Partial<Record<SendActivity, string>> = {
  pingpong: tr('{0} na torcida'),
  tennis: tr('{0} na torcida'),
  nap: tr('{0} cochilando na mesa'),
};

/** Troca o {0} de um texto já traduzido. */
const fill = (text: string, n: number): string => text.replace('{0}', String(n));

/** Texto do aviso depois de escolher uma atividade. */
export function activityToast(info: SendActivityInfo, r: SendAllResult): string {
  const parts: string[] = [];
  const extra = EXTRA[r.activity] && r.extra ? r.extra : 0;
  const main = r.sent.length - extra;
  if (main > 0) parts.push(fill(GOING[r.activity], main));
  if (extra) parts.push(fill(EXTRA[r.activity]!, extra));
  if (!r.sent.length) parts.push(r.activity === 'desk' ? tr('todos já estão na mesa') : tr('ninguém livre agora'));
  if (r.busy) parts.push(tr('{0} ocupados ficaram', [r.busy]));
  if (r.full) parts.push(tr('{0} sem lugar', [r.full]));
  if (r.nonSmokers) parts.push(tr('{0} não fumantes ficaram', [r.nonSmokers]));
  return `${info.emoji} ${info.label}: ${parts.join(' · ')}`;
}

/** Por que o menu está desligado agora (null = ligado). */
export function activitiesBlocked(s: { hasApi: boolean; replay: boolean; demo: boolean; count: number }): string | null {
  if (!s.hasApi) return tr('Indisponível neste escritório');
  if (s.replay) return tr('Indisponível durante o timelapse');
  if (s.demo) return tr('Indisponível com os agentes de demonstração');
  if (!s.count) return tr('Nenhuma atividade neste escritório');
  return null;
}

/** Aviso do horário de uma oração; diz quando a aba estava oculta (e se o chamado ainda foi feito). Puro. */
export function prayerTimeNotice(e: { name: PrayerName; called: boolean; hidden: boolean }): string {
  const name = prayerLabel(e.name);
  if (!e.hidden) return tr('🕌 {0} — hora da oração', [name]);
  return e.called ? tr('🕌 {0} — hora da oração (a aba estava oculta no horário)', [name]) : tr('🕌 {0} — foi a hora da oração enquanto a aba estava oculta', [name]);
}

// ---------------------------------------------------------------- popover

export class ActivitiesPopover implements UiComponent {
  readonly el: HTMLElement;
  /** Botão da barra superior (index.ts o coloca no grupo dos painéis). */
  readonly button: HTMLButtonElement;
  private listEl: HTMLElement;
  private closedAt = -Infinity;
  /** Atividades desenhadas na lista (evita refazer o DOM a cada quadro). */
  private drawn = '';
  private items: SendActivityInfo[] = [];

  constructor(
    private ctx: UiContext,
    private toast: (text: string) => void,
  ) {
    this.button = iconButton(ICONS.megaphone, tr('Atividades: chamar todo mundo (A)'), () => this.toggle(), 'ui-acts-btn');
    setAttr(this.button, 'aria-haspopup', 'menu');
    setAttr(this.button, 'aria-expanded', 'false');
    setAttr(this.button, 'aria-controls', 'ui-activities');
    this.listEl = h('div', { class: 'ui-acts__list', role: 'menu', attrs: { 'aria-label': tr('Atividades') } });
    this.listEl.addEventListener('keydown', (e) => this.onKey(e));
    const close = iconButton(ICONS.close, tr('Fechar atividades'), () => this.hide(), 'ui-icon-btn--sm');
    this.el = h(
      'div',
      { class: 'ui-popover ui-acts', role: 'dialog', tabIndex: -1, attrs: { 'aria-label': tr('Atividades'), id: 'ui-activities', popover: 'auto' } },
      h('div', { class: 'ui-popover__head' }, h('h2', { text: tr('Chamar todo mundo') }), close),
      h('p', { class: 'ui-acts__hint', text: tr('Quem está livre larga o que faz e vai junto; quem trabalha ou precisa de você fica.') }),
      this.listEl,
    );
    // horário de uma oração (chamado automático no campus): o aviso ("🕌 Dhuhr — hora da oração")
    ctx.world.onPrayerTime?.((e) => {
      const text = prayerTimeNotice(e);
      this.toast(text);
      this.ctx.announce(text);
    });
    this.el.addEventListener('toggle', () => {
      setAttr(this.button, 'aria-expanded', String(this.isOpen));
      this.button.classList.toggle('is-on', this.isOpen);
      if (!this.isOpen) this.closedAt = performance.now();
      this.ctx.root.classList.toggle('has-popover', this.isOpen);
    });
  }

  get isOpen(): boolean {
    try {
      return this.el.matches(':popover-open');
    } catch {
      return this.el.classList.contains('is-open');
    }
  }

  /** Motivo de estar desligado agora, ou null. */
  private blocked(): string | null {
    const { store, world } = this.ctx;
    return activitiesBlocked({
      hasApi: typeof world.sendAll === 'function' && typeof world.activities === 'function',
      replay: this.ctx.isTimelapseOpen() || store.replaying,
      demo: store.connection === 'open' && !!store.snapshot?.meta.demo,
      count: world.activities?.().length ?? 0,
    });
  }

  toggle(): void {
    if (this.isOpen) return this.hide();
    const why = this.blocked();
    if (why) {
      this.ctx.announce(why);
      return;
    }
    // O clique que fechou o popover (fora dele, no próprio botão) não o reabre.
    if (performance.now() - this.closedAt < REOPEN_GUARD_MS) return;
    const r = this.button.getBoundingClientRect();
    this.el.style.top = `${Math.round(r.bottom + 8)}px`;
    this.el.style.right = `${Math.max(8, Math.round(innerWidth - r.right - 4))}px`;
    this.renderList();
    if (typeof this.el.showPopover === 'function') this.el.showPopover();
    else this.el.classList.add('is-open');
    setAttr(this.button, 'aria-expanded', 'true');
    this.button.classList.add('is-on');
    this.ctx.root.classList.add('has-popover');
    this.buttons()[0]?.focus();
  }

  hide(): void {
    if (typeof this.el.hidePopover === 'function' && this.isOpen) this.el.hidePopover();
    this.el.classList.remove('is-open');
    setAttr(this.button, 'aria-expanded', 'false');
    this.button.classList.remove('is-on');
    this.ctx.root.classList.remove('has-popover');
  }

  render(): void {
    const why = this.blocked();
    // aria-disabled (e não disabled): o botão continua focável e a dica do porquê aparece no hover.
    setAttr(this.button, 'aria-disabled', why ? 'true' : null);
    this.button.classList.toggle('is-disabled', !!why);
    setTitle(this.button, why ? tr('Atividades: {0}', [why]) : tr('Atividades: chamar todo mundo (A)'));
    if (!this.isOpen) return;
    if (why) return this.hide();
    this.renderList();
  }

  /** Escolhe uma atividade: o mundo manda todo mundo e o aviso conta quem foi. */
  choose(id: SendActivity): void {
    const info = this.items.find((a) => a.id === id) ?? this.ctx.world.activities?.().find((a) => a.id === id);
    const res = this.ctx.world.sendAll?.(id);
    this.hide();
    this.button.focus();
    if (!info || !res) return;
    const text = activityToast(info, res);
    this.toast(text);
    this.ctx.announce(text);
  }

  private renderList(): void {
    this.items = this.ctx.world.activities?.() ?? [];
    const sig = this.items.map((a) => a.id).join(',');
    if (sig === this.drawn) return;
    this.drawn = sig;
    const frag = document.createDocumentFragment();
    for (const a of this.items) {
      const btn = h(
        'button',
        { class: `ui-acts__item${a.id === 'prayer' ? ' is-prayer' : ''}`, type: 'button', role: 'menuitem', on: { click: () => this.choose(a.id) } },
        h('span', { class: 'ui-acts__icon', text: a.emoji, attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'ui-acts__label', text: a.label }),
      );
      btn.dataset.activity = a.id;
      frag.append(btn);
    }
    this.listEl.replaceChildren(frag);
  }

  private buttons(): HTMLButtonElement[] {
    return [...this.listEl.querySelectorAll<HTMLButtonElement>('.ui-acts__item')];
  }

  /** Setas, Home e End entre as atividades (Esc fecha: light dismiss do popover). */
  private onKey(e: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = this.buttons();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (Math.max(0, i) + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    items[next]?.focus();
  }
}
