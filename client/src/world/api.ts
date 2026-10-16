// CONTRATO do mundo (canvas do escritório) consumido pela UI (client/src/ui/**).
// Implementação: client/src/world/index.ts -> createWorld().
// Regra: mudanças aqui devem ser ADITIVAS.

import { hijriTheme, hijriToday, type HijriDate } from './hijri';
import type { SendActivity, SendActivityInfo, SendAllResult } from './sim/send-all';

export type { SendActivity, SendActivityInfo, SendAllResult } from './sim/send-all';

export type Selection = { type: 'agent'; id: string } | { type: 'room'; id: string } | null;

export interface WorldOptions {
  /** Mostrar etiquetas com os nomes dos personagens. */
  showNames: boolean;
  /** Balões de atividade: todos, só importantes (precisa de você, selecionado, mudanças recentes) ou nenhum. */
  bubbles: 'all' | 'important' | 'none';
  /** Frequência de passeios pelo escritório quando os agentes estão ociosos. */
  liveliness: 'calm' | 'normal' | 'lively';
  /** Câmera acompanha o agente selecionado. */
  followSelected: boolean;
  /** Ciclo dia/noite pela hora local (janelas, iluminação). */
  dayNight: boolean;
  /** (Opcional, aditivo) Ciclo dia/noite: automático, sempre dia ou sempre noite. Vale sobre `dayNight`. */
  daylight?: DaylightMode;
  /** Tema visual: automático (segue o calendário hijri; ver seasonalThemeFor), nenhum, Ramadã, Eid al-Fitr ou Eid al-Adha. */
  theme?: OfficeTheme;
  /** (Opcional, aditivo) Equipe do escritório (limpeza): ausente/true = presente; false = sem equipe. */
  staff?: boolean;
}

/** Tema que o renderer desenha: o escritório original ('none') ou um dos sazonais. */
export type SeasonalTheme = 'none' | 'ramadan' | 'eid_fitr' | 'eid_adha';
export type OfficeTheme = 'auto' | SeasonalTheme;

export const SEASONAL_THEMES: readonly SeasonalTheme[] = ['none', 'ramadan', 'eid_fitr', 'eid_adha'];

/**
 * Tema desenhado numa data (hora local). No automático segue o calendário hijri (ver hijriTheme): Ramadã o mês
 * inteiro, Eid al-Fitr de 1 a 3 de Shawwal, Eid al-Adha de 10 a 13 de Dhu al-Hijjah e, no resto do ano, o
 * escritório original. `hijri` substitui a data convertida (prévia por `?hijri=` na URL). Valores
 * desconhecidos (temas antigos) valem como automático.
 */
export function seasonalThemeFor(theme: OfficeTheme | undefined, date: Date, hijri?: HijriDate | null): SeasonalTheme {
  if (theme && theme !== 'auto' && SEASONAL_THEMES.includes(theme)) return theme;
  return hijriTheme(hijri !== undefined ? hijri : hijriToday(date));
}

/** Ciclo dia/noite: segue a hora local, ou fixa o dia ou a noite. */
export type DaylightMode = 'auto' | 'day' | 'night';

/** Sons do ambiente que o mundo sugere (quem toca, e se toca, é a UI). */
export type SoundCueKind =
  | 'keys'
  | 'elevator'
  | 'pingpong'
  | 'table'
  | 'arcade'
  // jogos do campus: raquetada e quique do tênis, moedinhas das apostas
  | 'tennis'
  | 'bounce'
  | 'coins'
  // pausas: água do wudu, ronco nas cápsulas, isqueiro e baforada, xícaras do chá, TV (torcida), o chamado à oração
  | 'water'
  | 'snore'
  | 'lighter'
  | 'exhale'
  | 'cup'
  | 'tv'
  | 'cheer'
  | 'prayerCall'
  // trânsito: supercarro passando
  | 'car';

export interface SoundCue {
  kind: SoundCueKind;
  /** 0..1: proximidade (zoom, fora da tela...). */
  gain: number;
  /** -1 (esquerda) .. 1 (direita): posição na tela. */
  pan: number;
  /** Teclado: quantas teclas na rajada. */
  count?: number;
}

export interface WorldApi {
  /** Seleciona (ou limpa) um agente/sala. `focus` move a câmera até ele. */
  select(sel: Selection, opts?: { focus?: boolean }): void;
  getSelection(): Selection;
  /** Disparado quando a seleção muda (por clique no canvas ou por select()). */
  onSelect(cb: (sel: Selection) => void): () => void;
  /** Agente sob o cursor (para tooltips da UI). */
  onHover(cb: (agentId: string | null) => void): () => void;
  focusAgent(id: string, opts?: { follow?: boolean }): void;
  focusRoom(id: string): void;
  /** Enquadra o prédio inteiro. */
  overview(): void;
  zoomBy(factor: number): void;
  getOptions(): WorldOptions;
  setOptions(o: Partial<WorldOptions>): void;
  /** Posição na tela (CSS px, relativo à viewport) logo acima da cabeça do personagem, ou null se não visível. */
  screenPositionOf(agentId: string): { x: number; y: number } | null;
  /**
   * (Opcional, aditivo) Área da tela coberta por painéis da UI, em px CSS. O mundo passa a enquadrar
   * (visão geral) e centralizar (focusAgent/focusRoom/seguir) dentro da área livre.
   */
  setViewInsets?(insets: Partial<ViewInsets>): void;
  /**
   * (Opcional, aditivo) Vida social de um agente presente no escritório: personalidade, carteira de
   * moedinhas, amizades/rivalidades com quem está lá agora e a roda de que participa. null se não está.
   */
  social?(agentId: string): AgentSocial | null;
  /** (Opcional, aditivo) Botão direito numa sala do escritório: id da sala e o ponto do clique (px da janela). */
  onRoomContextMenu?(cb: (roomId: string, at: { x: number; y: number }) => void): () => void;
  /** (Opcional, aditivo) Acontecimentos sociais (partidas e apostas) para o feed. */
  onSocialEvent?(cb: (e: SocialEvent) => void): () => void;
  /**
   * (Opcional, aditivo) Timelapse: com `p`, o mundo passa a desenhar o dia reproduzido (relógio e fator de
   * animação de `p`); `null` volta ao vivo. Cada chamada recomeça o mundo do zero (ninguém anda até a mesa:
   * todos já aparecem no lugar), então chame ao entrar, ao pular para outro ponto e ao sair; o próximo
   * snapshot do store é aplicado como carga inicial.
   */
  setPlayback?(p: WorldPlayback | null): void;
  /**
   * (Opcional, aditivo) Atividades do menu "chamar todo mundo" que existem neste escritório (a mesquita, a quadra, as
   * cápsulas e a área de fumantes só no campus). Vazio no timelapse.
   */
  activities?(): SendActivityInfo[];
  /**
   * (Opcional, aditivo) Manda todos os agentes livres (ociosos ou esperando um shell) para a atividade; quem trabalha
   * ou precisa do usuário fica. null no timelapse ou se a atividade não existe aqui.
   */
  sendAll?(activity: SendActivity): SendAllResult | null;
  /** (Opcional, aditivo) Sons do ambiente: teclado de quem trabalha à vista, elevador, rodas. */
  onSound?(cb: (cue: SoundCue) => void): () => void;
  destroy(): void;
}

/** Relógios do timelapse (ver world/playback.ts). */
export interface WorldPlayback {
  /** Instante reproduzido (epoch ms): hora do céu, da iluminação e do relógio de parede. */
  clock(): number;
  /** Fator de animação (1 = tempo real; 0 = pausado). */
  scale(): number;
}

export interface AgentSocial {
  traits: { emoji: string; label: string; desc: string }[];
  /** Bordão ("Tá pago!"). */
  catchphrase: string;
  /** Saldo de moedinhas (🪙). */
  coins: number;
  /** Quanto já ganhou trabalhando (saldo inicial + tarefas + pedidos + entregas). */
  earned: number;
  wins: number;
  losses: number;
  /** Colegas presentes com quem tem amizade ou rivalidade; `record` = [vitórias, derrotas] contra ele. */
  bonds: { id: string; name: string; kind: 'amizade' | 'rivalidade'; record: [number, number] | null }[];
  /** O que está fazendo numa roda agora ("📺 Vendo futebol na TV com Rafaela"), ou null. */
  doing: string | null;
  /** Extrato: movimentações mais recentes primeiro. */
  ledger: { at: number; delta: number; icon: string; text: string }[];
}

/** Partida/aposta resolvida (vira uma linha do feed). */
export interface SocialEvent {
  id: string;
  at: number;
  icon: string;
  /** Protagonista (quem venceu). */
  agentId: string;
  /** Texto sem o nome do protagonista: "ganhou 🪙10 de Caio no jokenpô". */
  text: string;
  /** Onde aconteceu ("Lounge", "Copa"...). */
  place: string;
}

/** Margens da viewport cobertas pela UI (px CSS). */
export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_WORLD_OPTIONS: WorldOptions = {
  showNames: true,
  bubbles: 'important',
  liveliness: 'normal',
  followSelected: false,
  dayNight: true,
  theme: 'auto',
};
