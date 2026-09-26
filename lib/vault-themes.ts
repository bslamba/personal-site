// ============================================================
// lib/vault-themes.ts
//
// The vault's themes — one source of truth for the CSS, the theme
// picker's swatches, and the contrast check that keeps every one of them
// readable. Names follow Apple's product finishes and macOS wallpapers.
//
// Every text colour is chosen against the theme's own surfaces: body text
// at 7:1 or better, and even the faintest label, links, and the green/red
// money figures at 4.5:1 or better (WCAG AA). Run
//   node scripts/check-vault-themes.mjs
// after changing a value.
// ============================================================

export interface VaultTheme {
  id: string
  name: string
  dark: boolean
  bg: [string, string]            // wallpaper, top → bottom
  blobs: [string, string, string] // soft aurora glows drifting behind the glass
  ink: string; soft: string; faint: string
  line: string
  glass: string; glass2: string; edge: string
  solid: string                   // opaque surface: popovers, inputs, dock
  field: string
  accent: string; accent2: string; onAccent: string
  pos: string; neg: string; warn: string
  pop: string; popInk: string     // tooltips
  b: string; g: string            // the two person colours used in chips
  shadow: string
}

export const VAULT_THEMES: VaultTheme[] = [
  // ---------------- light ----------------
  { id: 'sequoia', name: 'Sequoia', dark: false,
    bg: ['#fbfaff', '#efe9fc'], blobs: ['rgba(190,160,255,0.55)', 'rgba(170,200,255,0.5)', 'rgba(245,190,240,0.45)'],
    ink: '#1f1838', soft: '#463d69', faint: '#5f5585', line: 'rgba(90,70,160,0.16)',
    glass: 'rgba(255,255,255,0.66)', glass2: 'rgba(255,255,255,0.86)', edge: 'rgba(255,255,255,0.8)', solid: '#ffffff', field: 'rgba(255,255,255,0.9)',
    accent: '#5b3fcb', accent2: '#8a55d6', onAccent: '#ffffff', pos: '#11764e', neg: '#c1273f', warn: '#a8500a',
    pop: '#241b40', popInk: '#ffffff', b: '#2f5cc4', g: '#9c3587', shadow: 'rgba(78,58,130,0.4)' },
  { id: 'starlight', name: 'Starlight', dark: false,
    bg: ['#fcf9f4', '#f1eadf'], blobs: ['rgba(247,218,170,0.6)', 'rgba(210,222,245,0.5)', 'rgba(250,210,190,0.45)'],
    ink: '#1d1b17', soft: '#48423a', faint: '#645d52', line: 'rgba(80,65,40,0.16)',
    glass: 'rgba(255,253,249,0.7)', glass2: 'rgba(255,253,249,0.88)', edge: 'rgba(255,255,255,0.85)', solid: '#fffdf9', field: '#fffdf9',
    accent: '#0a5cbd', accent2: '#1f6ccb', onAccent: '#ffffff', pos: '#1a7640', neg: '#bd2429', warn: '#9e4c07',
    pop: '#26221b', popInk: '#ffffff', b: '#1d5bba', g: '#9c3579', shadow: 'rgba(90,70,40,0.32)' },
  { id: 'titanium', name: 'Natural Titanium', dark: false,
    bg: ['#f4f3f0', '#e3e0da'], blobs: ['rgba(214,206,190,0.6)', 'rgba(196,208,222,0.5)', 'rgba(230,222,206,0.5)'],
    ink: '#1c1c1e', soft: '#434348', faint: '#5d5d63', line: 'rgba(40,40,45,0.14)',
    glass: 'rgba(255,255,255,0.62)', glass2: 'rgba(255,255,255,0.84)', edge: 'rgba(255,255,255,0.78)', solid: '#fbfbfa', field: '#fbfbfa',
    accent: '#3f536e', accent2: '#56698a', onAccent: '#ffffff', pos: '#1a7240', neg: '#bb262c', warn: '#9a4b08',
    pop: '#1c1c1e', popInk: '#ffffff', b: '#2b5aa8', g: '#963478', shadow: 'rgba(50,48,44,0.32)' },
  { id: 'sierra', name: 'Sierra Blue', dark: false,
    bg: ['#f3f8fe', '#dce8f7'], blobs: ['rgba(160,200,245,0.6)', 'rgba(205,225,255,0.55)', 'rgba(175,220,235,0.5)'],
    ink: '#0f1d33', soft: '#34445e', faint: '#4d5d77', line: 'rgba(30,70,130,0.15)',
    glass: 'rgba(255,255,255,0.64)', glass2: 'rgba(255,255,255,0.86)', edge: 'rgba(255,255,255,0.8)', solid: '#fbfdff', field: '#fbfdff',
    accent: '#0a5ec2', accent2: '#1c6bcf', onAccent: '#ffffff', pos: '#0f744a', neg: '#bf2637', warn: '#9c4d06',
    pop: '#0f1d33', popInk: '#ffffff', b: '#1f58b4', g: '#9a3586', shadow: 'rgba(30,60,110,0.35)' },
  { id: 'alpine', name: 'Alpine Green', dark: false,
    bg: ['#f2f9f4', '#d9ede0'], blobs: ['rgba(160,220,185,0.6)', 'rgba(205,238,215,0.55)', 'rgba(185,225,225,0.5)'],
    ink: '#10261a', soft: '#34503f', faint: '#4b6655', line: 'rgba(30,90,50,0.15)',
    glass: 'rgba(255,255,255,0.64)', glass2: 'rgba(255,255,255,0.86)', edge: 'rgba(255,255,255,0.8)', solid: '#fbfefc', field: '#fbfefc',
    accent: '#17703f', accent2: '#1d7f48', onAccent: '#ffffff', pos: '#11683a', neg: '#bd2536', warn: '#9a4c05',
    pop: '#10261a', popInk: '#ffffff', b: '#245aae', g: '#973381', shadow: 'rgba(30,80,50,0.32)' },
  { id: 'pink', name: 'Blush Pink', dark: false,
    bg: ['#fef5f8', '#f8dfe8'], blobs: ['rgba(250,185,210,0.6)', 'rgba(253,220,232,0.55)', 'rgba(225,200,245,0.5)'],
    ink: '#2a1520', soft: '#583848', faint: '#6f5060', line: 'rgba(150,50,90,0.15)',
    glass: 'rgba(255,255,255,0.64)', glass2: 'rgba(255,255,255,0.86)', edge: 'rgba(255,255,255,0.8)', solid: '#fffbfc', field: '#fffbfc',
    accent: '#b01c55', accent2: '#c5316b', onAccent: '#ffffff', pos: '#15723f', neg: '#a8231c', warn: '#9a4a06',
    pop: '#2a1520', popInk: '#ffffff', b: '#2659b0', g: '#8e2f76', shadow: 'rgba(130,40,80,0.3)' },
  { id: 'sonoma', name: 'Sonoma Sunset', dark: false,
    bg: ['#fff7ef', '#fcdfca'], blobs: ['rgba(255,190,150,0.6)', 'rgba(255,225,180,0.55)', 'rgba(245,185,210,0.5)'],
    ink: '#2b1609', soft: '#5a3822', faint: '#72523b', line: 'rgba(150,80,30,0.16)',
    glass: 'rgba(255,255,255,0.62)', glass2: 'rgba(255,255,255,0.85)', edge: 'rgba(255,255,255,0.8)', solid: '#fffaf5', field: '#fffaf5',
    accent: '#a8410a', accent2: '#b65212', onAccent: '#ffffff', pos: '#18713b', neg: '#b9232c', warn: '#8f4406',
    pop: '#2b1609', popInk: '#ffffff', b: '#2356ac', g: '#933278', shadow: 'rgba(140,70,20,0.3)' },
  // ---------------- dark ----------------
  { id: 'midnight', name: 'Midnight', dark: true,
    bg: ['#0b1220', '#141d33'], blobs: ['rgba(40,90,190,0.5)', 'rgba(95,60,180,0.4)', 'rgba(20,120,150,0.35)'],
    ink: '#f2f5fb', soft: '#c6cede', faint: '#a1acc0', line: 'rgba(160,180,220,0.16)',
    glass: 'rgba(22,32,56,0.66)', glass2: 'rgba(28,40,68,0.9)', edge: 'rgba(255,255,255,0.09)', solid: '#18233b', field: 'rgba(8,14,28,0.7)',
    accent: '#6cb2ff', accent2: '#97c9ff', onAccent: '#06101f', pos: '#5ae096', neg: '#ff8a98', warn: '#ffbe62',
    pop: '#f2f5fb', popInk: '#0b1220', b: '#8ab9ff', g: '#f29ada', shadow: 'rgba(0,0,0,0.55)' },
  { id: 'spaceblack', name: 'Space Black', dark: true,
    bg: ['#0a0a0b', '#18181b'], blobs: ['rgba(90,90,105,0.45)', 'rgba(40,70,110,0.4)', 'rgba(80,55,105,0.35)'],
    ink: '#f5f5f7', soft: '#c9c9ce', faint: '#a3a3aa', line: 'rgba(255,255,255,0.12)',
    glass: 'rgba(30,30,33,0.7)', glass2: 'rgba(40,40,44,0.92)', edge: 'rgba(255,255,255,0.08)', solid: '#242427', field: 'rgba(0,0,0,0.4)',
    accent: '#4aa3ff', accent2: '#7cbcff', onAccent: '#05080d', pos: '#3ddc6b', neg: '#ff7a70', warn: '#ffd426',
    pop: '#f5f5f7', popInk: '#0a0a0b', b: '#80b6ff', g: '#f19ad8', shadow: 'rgba(0,0,0,0.6)' },
  { id: 'deeppurple', name: 'Deep Purple', dark: true,
    bg: ['#120c20', '#231839'], blobs: ['rgba(125,75,210,0.5)', 'rgba(185,95,205,0.35)', 'rgba(75,65,170,0.45)'],
    ink: '#f6f1ff', soft: '#d3c8eb', faint: '#ae9fcd', line: 'rgba(200,170,255,0.15)',
    glass: 'rgba(34,24,56,0.66)', glass2: 'rgba(42,30,68,0.9)', edge: 'rgba(255,255,255,0.09)', solid: '#2a1f44', field: 'rgba(10,6,20,0.5)',
    accent: '#bd9dff', accent2: '#d8c0ff', onAccent: '#170d2c', pos: '#62e3a0', neg: '#ff8aa0', warn: '#ffc46b',
    pop: '#f6f1ff', popInk: '#120c20', b: '#94b8ff', g: '#f5a3e0', shadow: 'rgba(0,0,0,0.55)' },
  { id: 'graphite', name: 'Graphite', dark: true,
    bg: ['#1c1c1e', '#2b2b2e'], blobs: ['rgba(255,159,10,0.16)', 'rgba(95,95,105,0.4)', 'rgba(60,75,95,0.35)'],
    ink: '#f2f2f7', soft: '#cbcbd1', faint: '#a6a6ae', line: 'rgba(255,255,255,0.12)',
    glass: 'rgba(44,44,46,0.72)', glass2: 'rgba(52,52,55,0.92)', edge: 'rgba(255,255,255,0.07)', solid: '#333336', field: 'rgba(0,0,0,0.3)',
    accent: '#ffa630', accent2: '#ffc56e', onAccent: '#1c1c1e', pos: '#40d95a', neg: '#ff7b72', warn: '#ffd426',
    pop: '#f2f2f7', popInk: '#1c1c1e', b: '#86b9ff', g: '#f19ad8', shadow: 'rgba(0,0,0,0.55)' },
  { id: 'crimson', name: 'Crimson Night', dark: true,
    bg: ['#16070a', '#2a0d14'], blobs: ['rgba(205,35,55,0.4)', 'rgba(125,25,65,0.4)', 'rgba(255,95,85,0.18)'],
    ink: '#fff3f4', soft: '#f1ccd1', faint: '#cfa3aa', line: 'rgba(255,160,170,0.15)',
    glass: 'rgba(48,14,22,0.66)', glass2: 'rgba(58,18,28,0.9)', edge: 'rgba(255,255,255,0.08)', solid: '#3a1520', field: 'rgba(10,0,4,0.5)',
    accent: '#ff6a7c', accent2: '#ff9a9a', onAccent: '#1a0508', pos: '#62e3a0', neg: '#ffb3a6', warn: '#ffd166',
    pop: '#fff3f4', popInk: '#16070a', b: '#9dbdff', g: '#f7a8df', shadow: 'rgba(0,0,0,0.6)' },
]

export const DEFAULT_THEME = 'sequoia'
export const THEME_KEY = 'vg-theme'

const vars = (t: VaultTheme) => [
  `--vg-bg-1:${t.bg[0]}`, `--vg-bg-2:${t.bg[1]}`,
  `--vg-blob-a:${t.blobs[0]}`, `--vg-blob-b:${t.blobs[1]}`, `--vg-blob-c:${t.blobs[2]}`,
  `--vg-ink:${t.ink}`, `--vg-ink-soft:${t.soft}`, `--vg-ink-faint:${t.faint}`, `--vg-line:${t.line}`,
  `--vg-glass:${t.glass}`, `--vg-glass-2:${t.glass2}`, `--vg-edge:${t.edge}`, `--vg-solid:${t.solid}`, `--vg-field:${t.field}`,
  `--vg-accent:${t.accent}`, `--vg-accent-2:${t.accent2}`, `--vg-on-accent:${t.onAccent}`,
  `--vg-pos:${t.pos}`, `--vg-neg:${t.neg}`, `--vg-warn:${t.warn}`,
  `--vg-pop:${t.pop}`, `--vg-pop-ink:${t.popInk}`, `--vg-b:${t.b}`, `--vg-g:${t.g}`, `--vg-shadow:${t.shadow}`,
  // Chart series colours: the validated categorical set (dataviz palette),
  // stepped for light or dark surfaces, always in this fixed order.
  ...(t.dark ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'] : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']).map((c, i) => `--vg-pie-${i + 1}:${c}`),
  `color-scheme:${t.dark ? 'dark' : 'light'}`,
].join(';')

/** The stylesheet for every theme. The default applies to `.vg` itself; a
 *  chosen theme is `data-vg-theme` on <html>, set before first paint. */
export function themeCss(): string {
  const def = VAULT_THEMES.find(t => t.id === DEFAULT_THEME)!
  return [
    `.vg{${vars(def)}}`,
    ...VAULT_THEMES.map(t => `html[data-vg-theme="${t.id}"] .vg{${vars(t)}}`),
  ].join('\n')
}

/** Runs before paint so a dark theme never flashes light first. */
export const THEME_BOOT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t)document.documentElement.setAttribute('data-vg-theme',t)}catch(e){}`
