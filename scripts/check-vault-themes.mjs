// Checks every vault theme for readable text (WCAG contrast).
//   node scripts/check-vault-themes.mjs
// Text is measured against the glass cards as they actually look — the
// translucent surface laid over the theme's wallpaper — and against the
// opaque surfaces (popovers, inputs). Fails loudly on anything below target.
import { VAULT_THEMES } from '../lib/vault-themes.ts'

const parse = c => {
  if (c.startsWith('#')) { const h = c.slice(1); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(1) }
  const m = c.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number); return [m[0], m[1], m[2], m[3] ?? 1]
}
const over = (top, under) => { const [r, g, b, a] = parse(top), [R, G, B] = under; return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)] }
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

let bad = 0
for (const t of VAULT_THEMES) {
  // Worst case of the two wallpaper ends, and the aurora glows on top.
  const walls = t.bg.flatMap(bg => [parse(bg).slice(0, 3), ...t.blobs.map(bl => over(bl, parse(bg).slice(0, 3)))])
  const surfaces = [...walls.map(w => over(t.glass, w)), ...walls.map(w => over(t.glass2, w)), parse(t.solid).slice(0, 3)]
  const need = { ink: 7, soft: 4.5, faint: 4.5, accent: 4.5, pos: 4.5, neg: 4.5, warn: 4.5, b: 4.5, g: 4.5 }
  const rows = []
  for (const [k, min] of Object.entries(need)) {
    const worst = Math.min(...surfaces.map(s => ratio(parse(t[k]).slice(0, 3), s)))
    rows.push([k, worst, min])
  }
  rows.push(['onAccent/accent', ratio(parse(t.onAccent).slice(0, 3), parse(t.accent).slice(0, 3)), 4.5])
  rows.push(['onAccent/accent2', ratio(parse(t.onAccent).slice(0, 3), parse(t.accent2).slice(0, 3)), 4.5])
  rows.push(['popInk/pop', ratio(parse(t.popInk).slice(0, 3), parse(t.pop).slice(0, 3)), 7])
  const fails = rows.filter(([, v, min]) => v < min)
  bad += fails.length
  console.log(`${fails.length ? '✗' : '✓'} ${t.name.padEnd(17)} ${rows.map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  ')}`)
  for (const [k, v, min] of fails) console.log(`    ${k}: ${v.toFixed(2)} < ${min}`)
}
if (bad) { console.error(`\n${bad} contrast failure(s)`); process.exit(1) }
console.log('\nAll themes readable.')
