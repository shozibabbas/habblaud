// Grupo "Mesquita" das configurações: o jeito de rezar (sunni/shia), a cidade dos horários das orações (nome, latitude e
// longitude; o fuso é o do navegador), o chamado automático nos horários, juntar as orações (estilo shia) e os horários
// de hoje. Grava no servidor (PUT /api/mosque, server/mosque.ts: <dataDir>/mosque.json), só pelo próprio computador,
// como o dono do escritório. Os interruptores e o estilo gravam na hora; a cidade, com "Salvar".
import { DEFAULT_MOSQUE, methodFor, type MosqueSettings, type PrayerStyle } from '../../../shared/mosque';
import { formatHM, prayersOn, type PrayerName } from '../../../shared/prayer-times';
import { tr } from '../../../shared/i18n';
import type { UiContext } from './context';
import { h, setAttr, setHidden, setText } from './dom';
import { canEditOwner } from './settings-owner';
import { mockMosqueFrom } from '../world/campus-mock';

/** Nome de cada oração (o mesmo em todos os idiomas, com a grafia usada no Paquistão). */
export function prayerLabel(name: PrayerName): string {
  switch (name) {
    case 'fajr':
      return tr('Fajr');
    case 'dhuhr':
      return tr('Dhuhr');
    case 'asr':
      return tr('Asr');
    case 'maghrib':
      return tr('Maghrib');
    case 'isha':
      return tr('Isha');
  }
}

/** Horários de hoje ("Fajr 05:00") no fuso do navegador, para a configuração em uso. */
export function todayTimes(m: MosqueSettings, now = Date.now()): { name: PrayerName; text: string }[] {
  const tz = -new Date(now).getTimezoneOffset() / 60;
  return prayersOn(now, m.lat, m.lon, methodFor(m.style)).map((p) => ({ name: p.name, text: formatHM(p.at / 3_600_000 + tz) }));
}

function switchRow(label: string, hint: string, onToggle: () => void): { row: HTMLElement; btn: HTMLButtonElement } {
  const id = `ui-sw-mosque-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const btn = h('button', { class: 'ui-switch', type: 'button', role: 'switch', attrs: { 'aria-checked': 'false', 'aria-labelledby': id } }, h('span', { class: 'ui-switch__knob' })) as HTMLButtonElement;
  btn.addEventListener('click', onToggle);
  const row = h('div', { class: 'ui-set' }, h('div', { class: 'ui-set__text' }, h('span', { class: 'ui-set__label', text: label, attrs: { id } }), h('span', { class: 'ui-set__hint', text: hint })), btn);
  return { row, btn };
}

export class MosqueSettingsGroup {
  readonly el: HTMLElement;
  private readonly styleBtns: HTMLButtonElement[];
  private readonly city: HTMLInputElement;
  private readonly lat: HTMLInputElement;
  private readonly lon: HTMLInputElement;
  private readonly call: ReturnType<typeof switchRow>;
  private readonly combine: ReturnType<typeof switchRow>;
  private readonly times: HTMLElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly error: HTMLElement;
  private busy = false;
  /** Gravado agora há pouco (até o snapshot trazer a configuração nova). */
  private pending: MosqueSettings | null = null;

  constructor(private ctx: UiContext) {
    const styles: [PrayerStyle, string][] = [
      ['sunni', tr('Sunni')],
      ['shia', tr('Shia')],
    ];
    const group = h('div', { class: 'ui-seg', role: 'radiogroup', attrs: { 'aria-label': tr('Jeito de rezar') } });
    this.styleBtns = styles.map(([v, text]) => {
      const b = h('button', { class: 'ui-seg__opt', type: 'button', role: 'radio', text, attrs: { 'aria-checked': 'false' } }) as HTMLButtonElement;
      b.addEventListener('click', () => void this.save({ style: v }));
      group.append(b);
      return b;
    });
    const input = (label: string, inputmode = 'text') =>
      h('input', { class: 'ui-owner__input', type: 'text', attrs: { autocomplete: 'off', spellcheck: 'false', inputmode, 'aria-label': label } }) as HTMLInputElement;
    const field = (label: string, el: HTMLInputElement) => h('label', { class: 'ui-owner__field' }, h('span', { class: 'ui-set__label', text: label }), el);
    this.city = input(tr('Cidade'));
    this.lat = input(tr('Latitude'), 'decimal');
    this.lon = input(tr('Longitude'), 'decimal');
    for (const el of [this.city, this.lat, this.lon]) {
      el.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') {
          ev.preventDefault();
          void this.saveCity();
        }
      });
      el.addEventListener('keyup', (ev) => ev.stopPropagation());
    }
    this.call = switchRow(tr('Chamado para a oração nos horários'), tr('Nos cinco horários: os minaretes acendem, toca o sino suave e todos que estão livres vão rezar juntos na mesquita.'), () => void this.save({ call: !this.current().call }));
    this.combine = switchRow(tr('Juntar Dhuhr com Asr e Maghrib com Isha'), tr('Estilo shia: as duas orações seguidas no horário da primeira (o Asr e o Isha não chamam de novo).'), () => void this.save({ combine: !this.current().combine }));
    this.saveBtn = h('button', { class: 'ui-btn ui-btn--primary ui-btn--sm', type: 'button', text: tr('Salvar cidade'), on: { click: () => void this.saveCity() } }) as HTMLButtonElement;
    this.times = h('p', { class: 'ui-set__hint ui-mosque__times', attrs: { 'aria-live': 'polite' } });
    this.hint = h('p', { class: 'ui-set__hint' });
    this.error = h('p', { class: 'ui-owner__error', role: 'alert', hidden: true });
    this.el = h(
      'div',
      { class: 'ui-set-group ui-mosque' },
      h('h3', { text: tr('Mesquita') }),
      h('p', { class: 'ui-set__hint', text: tr('A mesquita do campus (escritório combinado): o jeito de rezar dos personagens e os horários das orações, calculados para a cidade.') }),
      h(
        'div',
        { class: 'ui-set ui-set--stack' },
        h('span', { class: 'ui-set__label', text: tr('Jeito de rezar') }),
        group,
        h('span', { class: 'ui-set__hint', text: tr('Sunni: mãos cruzadas no qiyam. Shia: mãos ao lado do corpo, a turbah na prostração e o qunoot na 2ª rak\'ah; horários pelo método Jafari.') }),
      ),
      this.call.row,
      this.combine.row,
      h('div', { class: 'ui-owner__grid' }, field(tr('Cidade'), this.city), field(tr('Latitude'), this.lat), field(tr('Longitude'), this.lon)),
      h('div', { class: 'ui-owner__actions' }, this.saveBtn),
      h('div', { class: 'ui-set ui-set--stack' }, h('span', { class: 'ui-set__label', text: tr('Horários de hoje') }), this.times),
      this.error,
      this.hint,
    );
  }

  private current(): MosqueSettings {
    // no mock (sem servidor), a configuração pedida na URL (&prayer=shia), como o mundo usa
    const mock = this.ctx.store.mock && typeof location !== 'undefined' ? mockMosqueFrom(location.search) : null;
    return this.pending ?? this.ctx.store.snapshot?.meta.mosque ?? mock ?? DEFAULT_MOSQUE;
  }

  /** Ao abrir as configurações: os campos voltam à configuração em uso. */
  load(): void {
    this.pending = null;
    const m = this.current();
    this.city.value = m.city;
    this.lat.value = String(m.lat);
    this.lon.value = String(m.lon);
    this.showError(null);
    this.render();
  }

  render(): void {
    const m = this.current();
    if (this.pending && this.ctx.store.snapshot?.meta.mosque && JSON.stringify(this.ctx.store.snapshot.meta.mosque) === JSON.stringify(this.pending)) this.pending = null;
    const editable = canEditOwner(this.ctx);
    this.styleBtns.forEach((b, i) => {
      const on = (i === 0 ? 'sunni' : 'shia') === m.style;
      setAttr(b, 'aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.disabled = !editable || this.busy;
    });
    setAttr(this.call.btn, 'aria-checked', String(m.call));
    setAttr(this.combine.btn, 'aria-checked', String(m.combine));
    setHidden(this.combine.row, m.style !== 'shia');
    for (const el of [this.call.btn, this.combine.btn, this.city, this.lat, this.lon, this.saveBtn]) el.disabled = !editable || this.busy;
    const parts = todayTimes(m).map((t) => `${prayerLabel(t.name)} ${t.text}`);
    setText(this.times, `${m.city || tr('Cidade sem nome')}: ${parts.join(' · ')}`);
    setText(
      this.hint,
      editable
        ? tr('O fuso horário é o do navegador. Método dos horários: Jafari (shia) ou Karachi (sunni).')
        : this.ctx.store.mock
          ? tr('No modo mock não há servidor para gravar (use &prayer=shia na URL para ver o estilo shia).')
          : tr('Só pelo próprio computador (http://localhost), com o Habblaud acessível apenas por ele.'),
    );
  }

  private showError(message: string | null): void {
    setText(this.error, message ?? '');
    setHidden(this.error, !message);
  }

  private async saveCity(): Promise<void> {
    const lat = Number(this.lat.value.replace(',', '.'));
    const lon = Number(this.lon.value.replace(',', '.'));
    if (!Number.isFinite(lat) || Math.abs(lat) > 90) return this.showError(tr('Latitude entre -90 e 90.'));
    if (!Number.isFinite(lon) || Math.abs(lon) > 180) return this.showError(tr('Longitude entre -180 e 180.'));
    await this.save({ city: this.city.value, lat, lon });
  }

  private async save(body: Partial<MosqueSettings>): Promise<void> {
    if (this.busy || !canEditOwner(this.ctx)) return;
    this.busy = true;
    this.showError(null);
    this.render();
    try {
      const res = await fetch('/api/mosque', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = (await res.json().catch(() => ({}))) as { mosque?: MosqueSettings; error?: string };
      if (!res.ok || !out.mosque) return this.showError(out.error ?? tr('erro {0}', [res.status]));
      this.pending = out.mosque;
      this.ctx.announce(tr('Mesquita salva: {0}.', [out.mosque.city || tr('Cidade sem nome')]));
    } catch {
      this.showError(tr('o Habblaud não respondeu'));
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
