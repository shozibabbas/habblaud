// Escritório combinado: o app instalável (PWA) ganha nome e ícone próprios ("campus"), para não se confundir com o
// escritório de um computador só. Parte do manifest do cliente (dist/client/manifest.webmanifest) e troca o que muda.

/** Ícones do campus, em client/public/assets/brand/campus/. */
export const CAMPUS_ICONS = [
  { src: '/assets/brand/campus/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/assets/brand/campus/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/assets/brand/campus/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  { src: '/assets/brand/campus/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
];

export function campusManifest(base: Record<string, unknown>, machines: string[]): Record<string, unknown> {
  return {
    ...base,
    // Outro id: o app do escritório combinado é instalado ao lado do escritório comum, não por cima dele.
    id: '/?app=campus',
    name: 'Habblaud Campus',
    short_name: 'Campus',
    description: `Habblaud: ${machines.join(', ')}`,
    start_url: '/?app=campus',
    icons: CAMPUS_ICONS,
  };
}
