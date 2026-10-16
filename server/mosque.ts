// Configuração da mesquita do campus (shared/mosque.ts): o estilo da oração, a cidade dos horários, o chamado
// automático e juntar as orações. Fica em <dataDir>/mosque.json, gravada pelas Configurações (PUT /api/mosque, só pelo
// próprio computador, como o dono do escritório). HABBLAUD_PRAYER_STYLE (sunni | shia) é só o estilo inicial, enquanto o
// mosque.json não existe. Vai para OfficeSnapshot.meta.mosque.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tr } from '../shared/i18n';
import { DEFAULT_MOSQUE, parseMosque, type MosqueSettings, type PrayerStyle } from '../shared/mosque';
import { errMsg, log } from './log';

export type MosqueSource = 'settings' | 'env' | 'default';

export class MosqueStore {
  private value: MosqueSettings | null = null;

  /** `file` null = só em memória (testes); `style` = HABBLAUD_PRAYER_STYLE. */
  constructor(
    private readonly file: string | null,
    private readonly style?: PrayerStyle,
  ) {}

  load(): void {
    if (!this.file) return;
    try {
      const j = JSON.parse(readFileSync(this.file, 'utf8')) as { mosque?: unknown };
      const r = parseMosque(j.mosque, this.base());
      if ('invalid' in r) throw new Error(tr('campo "{0}" fora do formato', [r.invalid]));
      this.value = r.mosque;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn(tr('mosque.json ilegível ({0}); vale a configuração padrão da mesquita.', [errMsg(err)]));
    }
  }

  private base(): MosqueSettings {
    return { ...DEFAULT_MOSQUE, ...(this.style ? { style: this.style } : {}) };
  }

  get(): MosqueSettings {
    return this.value ?? this.base();
  }

  source(): MosqueSource {
    return this.value ? 'settings' : this.style ? 'env' : 'default';
  }

  /** Aplica um PUT parcial por cima da configuração em uso e grava. */
  update(body: unknown): { mosque: MosqueSettings } | { invalid: string } {
    const r = parseMosque(body, this.get());
    if ('invalid' in r) return r;
    this.value = r.mosque;
    if (this.file) {
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(`${this.file}.tmp`, JSON.stringify({ version: 1, mosque: r.mosque }, null, 2));
        renameSync(`${this.file}.tmp`, this.file);
      } catch (err) {
        log.warn(tr('Não consegui gravar {0}: {1}', [this.file, errMsg(err)]));
      }
    }
    return r;
  }
}
