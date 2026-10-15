// O app do cliente: store (dados) -> mundo (canvas) -> UI (painéis). Carregado por main.ts depois do dicionário do
// idioma ativo, porque vários módulos chamam tr() ao carregar.
import { loadAccess } from './net/access';
import { OfficeStore } from './net/store';
import { createWorld } from './world';
import { createUI } from './ui';
import { embedRequested } from './ui/embed';
import { migrateLegacyKeys, safeLocalStorage } from './ui/prefs';
import { getLocale, tr } from '../../shared/i18n';

export function start(): void {
  // Antes de tudo: o mundo (carteiras) e a UI (preferências) leem o localStorage ao serem criados.
  migrateLegacyKeys(safeLocalStorage());

  // Idioma escolhido (shared/i18n): leitores de tela e o corretor do navegador seguem o atributo lang.
  document.documentElement.lang = getLocale();
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    tr('Escritório virtual em pixel art que mostra, em tempo real, o que seus agentes do Claude Code estão fazendo.'),
  );

  const params = new URLSearchParams(location.search);
  const store = new OfficeStore({ mock: params.has('mock') });
  const world = createWorld(document.getElementById('world') as HTMLCanvasElement, store);
  // ?embed=1: dentro do iframe de um painel com vários escritórios (ui/embed.ts).
  createUI(document.getElementById('ui') as HTMLElement, store, world, { embed: embedRequested(location.search) });
  // Escritório combinado (várias máquinas): favicon e ícone de tela inicial do campus (server/federation/manifest.ts).
  const offBrand = store.on('snapshot', (snap) => {
    if ((snap.meta.machines?.length ?? 0) < 2) return;
    offBrand();
    useCampusIcons();
  });
  // O que esta página pode fazer (porta local ou remota com login) chega antes do primeiro snapshot (ou desiste em
  // poucos segundos e fica a regra de antes).
  if (store.mock) store.connect();
  else {
    void loadAccess().finally(() => store.connect());
    // Reconexão (servidor reiniciado, celular de volta do bloqueio): o acesso pode ter mudado, e o login pode ter
    // vencido (loadAccess leva à tela de entrada).
    let opened = false;
    store.on('connection', (state) => {
      if (state === 'open') {
        if (opened) void loadAccess();
        opened = true;
      } else if (state === 'closed' && opened) void loadAccess();
    });
  }

  // Facilita a depuração pelo console do navegador.
  Object.assign(window, { habblaud: { store, world } });
}

function useCampusIcons(): void {
  const base = '/assets/brand/campus/';
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
    link.href = link.sizes.contains('16x16') ? `${base}favicon-16.png` : `${base}favicon-32.png`;
  }
  const touch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (touch) touch.href = `${base}apple-touch-icon.png`;
}
