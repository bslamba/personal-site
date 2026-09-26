// ============================================================
// components/vault/transform-out.ts
//
// Signing out: the page itself transforms.
//
// Everything on screen — the Dock icons, the buttons, the cards, the table
// rows, the headings, the big numbers — is lifted off the page as a real
// copy of itself (styles and all). Then, the way a transforming robot
// reshapes in the films:
//   1. the page cracks; each element breaks loose in a ripple from the
//      sign-out button, and the machinery under the page is revealed
//   2. a robot frame unfolds in the middle — legs, spine, arms, head
//   3. every element flies in on a multi-step path — lift, pause, tumble,
//      edge-on approach, slide, fold flat with a hinge overshoot, lock —
//      flipping to show a painted metal back where it's armour, keeping the
//      website's face where it fits; sparks fly where each part locks
//   4. the big letters and numbers swarm in and become its stencilled
//      markings; wheels roll in and seat on its legs and back
//   5. it stands, its eyes ignite, its chest opens, it looks at you —
//      then crouches and launches out of frame
// The sound is transform-sound.ts, on the same timeline (TL).
// Pure DOM + Web Animations; nothing here touches your data.
// ============================================================

import { TL, transformSound, type SoundEvent } from './transform-sound'

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const sgn = () => (Math.random() < 0.5 ? -1 : 1)
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, css = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (css) e.style.cssText = css
  return e
}

// ---------- the robot ----------------------------------------------
// In robot units: 100 tall, centred at x = 0, head top −50, feet 50.
type Group = 'body' | 'head' | 'chestL' | 'chestR'
type Paint = 'p' | 's' | 'd' | 'c'   // primary, secondary, dark, chrome
interface Slot { key: string; x: number; y: number; w: number; h: number; r: number; g: Group; paint: Paint; o: number }

function robotSlots(): Slot[] {
  const S: Slot[] = []
  const add = (key: string, x: number, y: number, w: number, h: number, r: number, g: Group, paint: Paint, o: number) => S.push({ key, x, y, w, h, r, g, paint, o })
  const pair = (key: string, x: number, y: number, w: number, h: number, r: number, g: 'body' | 'head' | 'chest', paint: Paint, o: number) => {
    add(`${key}L`, -x, y, w, h, -r, g === 'chest' ? 'chestL' : g, paint, o)
    add(`${key}R`, x, y, w, h, r, g === 'chest' ? 'chestR' : g, paint, o + 0.15)
  }
  pair('foot', 7.5, 38.5, 11, 4, 0, 'body', 'd', 0)
  pair('shin', 6.5, 28, 8, 15, 0, 'body', 's', 1)
  pair('knee', 6, 18.5, 6.5, 4.2, 0, 'body', 'p', 2)
  pair('thigh', 5.5, 10, 7, 13, 0, 'body', 's', 3)
  add('hips', 0, 1, 17, 5, 0, 'body', 'd', 4)
  pair('guard', 9.8, 4.5, 5, 8, 8, 'body', 'p', 4.5)
  add('abs1', 0, -5, 10, 3.2, 0, 'body', 'd', 5)
  add('abs2', 0, -8.6, 11, 3.2, 0, 'body', 'd', 5.2)
  add('abs3', 0, -12.2, 12, 3.2, 0, 'body', 'd', 5.4)
  pair('stack', 11, -35, 3, 12, 12, 'body', 's', 5.6)
  pair('chest', 5.6, -21, 10.5, 10, 0, 'chest', 'p', 6)
  add('collar', 0, -27.6, 18, 3, 0, 'body', 's', 6.6)
  pair('uarm', 17.5, -17, 5, 11, 0, 'body', 's', 7)
  pair('farm', 20, -4, 6.5, 12, 5, 'body', 'p', 8)
  pair('hand', 21, 5.5, 5, 5, 0, 'body', 'd', 8.6)
  pair('shoulder', 15.5, -26, 12, 7.5, 10, 'body', 'p', 9)
  add('neck', 0, -30.2, 4, 2.6, 0, 'body', 'd', 10)
  add('helmet', 0, -43.5, 10, 5.5, 0, 'head', 'p', 11)
  pair('fin', 6.2, -41, 2.2, 7, 8, 'head', 'p', 11.2)
  add('face', 0, -37.8, 8.5, 5, 0, 'head', 'c', 11.3)
  add('mouth', 0, -33.4, 6, 2.8, 0, 'head', 'd', 11.5)
  add('crest', 0, -47.8, 3, 3.5, 0, 'head', 'c', 11.7)
  return S
}
// Where the letters and numbers become stencilled markings.
const MARK_ROWS = [
  { x: 0, y: -27.6, len: 14, hgt: 2.0, r: 0, v: false },
  { x: -15.5, y: -26, len: 8, hgt: 2.2, r: -10, v: false },
  { x: 15.5, y: -26, len: 8, hgt: 2.2, r: 10, v: false },
  { x: -6.5, y: 28, len: 12, hgt: 2.0, r: 0, v: true },
  { x: 6.5, y: 28, len: 12, hgt: 2.0, r: 0, v: true },
]
const SCHEMES = ['prime', 'hornet', 'steel'] as const

// ---------- lifting the page ----------------------------------------
interface Grab { el: Element; r: DOMRect }
interface Char { ch: string; r: DOMRect; css: string; color: string }

const PROPS = ['display', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top', 'border-right', 'border-bottom', 'border-left', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-clip', '-webkit-background-clip',
  'color', '-webkit-text-fill-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-numeric', 'line-height', 'letter-spacing',
  'text-transform', 'text-align', 'text-decoration', 'text-shadow', 'white-space', 'text-overflow', 'overflow', 'box-shadow', 'opacity',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-self', 'justify-content', 'gap',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'vertical-align', 'object-fit', 'list-style-type',
  'position', 'top', 'left', 'right', 'bottom', 'transform', 'transform-origin', 'z-index', 'table-layout', 'border-collapse', 'border-spacing', 'fill', 'stroke', 'stroke-width']
const SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'color', 'fill-opacity', 'stroke-opacity']

/** A copy of an element that looks the same anywhere: computed styles inlined. */
function snapshot(src: Element, root = true): Node {
  const c = src.cloneNode(false) as Element
  const cs = getComputedStyle(src)
  const svgChild = src instanceof SVGElement && !(src instanceof SVGSVGElement)
  let css = ''
  for (const p of svgChild ? SVG_PROPS : PROPS) { const v = cs.getPropertyValue(p); if (v) css += `${p}:${v};` }
  if (!svgChild) {
    css += 'margin:0;transition:none;animation:none;'
    if (cs.position === 'fixed' || cs.position === 'sticky') css += `position:${root ? 'static' : 'relative'};`
  }
  c.setAttribute('style', css)
  if (!(src instanceof SVGElement)) c.removeAttribute('id')
  if (src instanceof HTMLInputElement || src instanceof HTMLTextAreaElement || src instanceof HTMLSelectElement) (c as HTMLInputElement).value = src.value
  if (src instanceof HTMLCanvasElement) {
    const img = document.createElement('img')
    try { img.src = src.toDataURL() } catch { /* tainted canvas: leave it blank */ }
    img.setAttribute('style', css)
    return img
  }
  for (const ch of Array.from(src.childNodes)) {
    if (ch.nodeType === Node.TEXT_NODE) c.appendChild(ch.cloneNode())
    else if (ch instanceof Element && !(ch instanceof HTMLScriptElement) && !(ch instanceof HTMLStyleElement)) c.appendChild(snapshot(ch, false))
  }
  return c
}

// SVG ids inside a copy are renamed, and every url(#…)/href="#…" pointed at
// them: the originals get hidden, and a clip-path aimed at a hidden
// <clipPath> clips everything away.
let idSeq = 0
function reid(root: Node) {
  if (!(root instanceof Element)) return root
  const map = new Map<string, string>()
  const all = [root, ...Array.from(root.querySelectorAll('*'))]
  for (const el of all) {
    const id = el.getAttribute('id')
    if (id && el.closest('svg')) { const nid = `${id}-tx${++idSeq}`; map.set(id, nid); el.setAttribute('id', nid) }
  }
  if (!map.size) return root
  const fix = (v: string) => v.replace(/url\((["']?)[^#"')]*#([^"')]+)\1\)/g, (m, q, id) => (map.has(id) ? `url(#${map.get(id)})` : m)).replace(/^#(.+)$/, (m, id) => (map.has(id) ? `#${map.get(id)}` : m))
  for (const el of all) for (const at of Array.from(el.attributes)) {
    if (at.name === 'id') continue
    if (at.value.includes('#')) { const nv = fix(at.value); if (nv !== at.value) el.setAttribute(at.name, nv) }
  }
  return root
}

const clear = (col: string) => col === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(col)

function harvest(root: Element, vw: number, vh: number) {
  // Fine-grained: every icon, cell, button and label is its own part.
  const maxA = vw * vh * 0.025, minA = 160
  const grabs: Grab[] = []
  const texts: { el: Element; size: number }[] = []
  const walk = (el: Element) => {
    const cs = getComputedStyle(el)
    const kids = Array.from(el.children).filter(k => !(k instanceof HTMLScriptElement || k instanceof HTMLStyleElement))
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return
    if (cs.display === 'contents') { kids.forEach(walk); return }
    const r = el.getBoundingClientRect()
    if (r.width < 3 || r.height < 3) { kids.forEach(walk); return }
    if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return
    const a = r.width * r.height
    const isSvg = el instanceof SVGElement
    if (!isSvg && kids.length && (a > maxA || (kids.length >= 2 && a > 5000))) { kids.forEach(walk); return }
    if (a < minA) return
    const txt = (el.textContent || '').trim()
    const fs = parseFloat(cs.fontSize)
    if (!isSvg && txt.length >= 2 && txt.length <= 18 && fs >= 17 && el.children.length <= 2) texts.push({ el, size: fs })
    else grabs.push({ el, r })
  }
  walk(root)

  // The biggest letters and numbers on screen become characters in flight.
  const chars: Char[] = []
  const used = new Set<Element>()
  for (const { el } of texts.sort((x, y) => y.size - x.size)) {
    if (chars.length >= 36) { grabs.push({ el, r: el.getBoundingClientRect() }); continue }
    used.add(el)
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = tw.nextNode(); n && chars.length < 36; n = tw.nextNode()) {
      const s = n.textContent || '', pcs = getComputedStyle(n.parentElement ?? el)
      let color = pcs.color
      if (clear(color) || clear(pcs.getPropertyValue('-webkit-text-fill-color'))) color = '#e8eef4'
      const css = `font-family:${pcs.fontFamily};font-size:${pcs.fontSize};font-weight:${pcs.fontWeight};font-style:${pcs.fontStyle};`
      for (let i = 0; i < s.length && chars.length < 36; i++) {
        if (!s[i].trim()) continue
        const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1)
        const rr = rg.getBoundingClientRect()
        if (rr.width > 0 && rr.height > 0) chars.push({ ch: s[i], r: rr, css, color })
      }
    }
  }
  const area = (g: Grab) => g.r.width * g.r.height
  let budget = 3500
  const kept = grabs.sort((x, y) => area(y) - area(x)).filter(g => {
    const n = g.el.getElementsByTagName('*').length + 1
    if (n > 320 || budget - n < 0) return false
    budget -= n
    return true
  }).slice(0, 90)
  return { grabs: kept, chars, used }
}

// ---------- the machinery under the page ------------------------------
function gearPath(r: number, n: number) {
  const tip = r * 1.13, pts: string[] = [], s = (Math.PI * 2) / n
  const P = (rad: number, ang: number) => `${(rad * Math.cos(ang)).toFixed(1)},${(rad * Math.sin(ang)).toFixed(1)}`
  for (let i = 0; i < n; i++) { const a = i * s; pts.push(P(r, a), P(tip, a + s * 0.15), P(tip, a + s * 0.45), P(r, a + s * 0.6)) }
  return `M${pts.join('L')}Z`
}
function machinery(): HTMLElement {
  const bg = h('div', 'vg-tx-bg')
  const gears: [number, number, number, number, number][] = [
    [140, 220, 150, 18, 14], [330, 110, 80, 12, -8], [860, 260, 170, 20, -16], [690, 90, 70, 10, 7],
    [120, 820, 190, 22, -18], [900, 820, 140, 16, 12], [520, 980, 110, 14, -10], [300, 640, 60, 9, 6], [760, 600, 55, 9, -5],
  ]
  let svg = '<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
  for (const d of ['M0 400H220L300 480H520', 'M1000 520H800L740 460H560', 'M380 0V160L440 220V380', 'M620 1000V820L560 760V620', 'M0 640H160L200 600H300'])
    svg += `<path class="conduit" d="${d}"/>`
  for (const [x, y, r, n, s] of gears) {
    let spokes = ''
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; spokes += `<line x2="${(r * 0.55 * Math.cos(a)).toFixed(1)}" y2="${(r * 0.55 * Math.sin(a)).toFixed(1)}" stroke="#1d242c" stroke-width="${(r * 0.1).toFixed(1)}"/>` }
    svg += `<g transform="translate(${x} ${y})"><g class="gear" style="animation-duration:${Math.abs(s)}s;animation-direction:${s < 0 ? 'reverse' : 'normal'}">` +
      `<path d="${gearPath(r, n)}" fill="#141920" stroke="#2c353f" stroke-width="2"/><circle r="${r * 0.62}" fill="none" stroke="#222a33" stroke-width="${r * 0.12}"/>${spokes}` +
      `<circle r="${r * 0.2}" fill="#0b0e12" stroke="#3b4652" stroke-width="3"/></g></g>`
  }
  for (const [x, y, d] of [[230, 380, 0], [790, 420, 0.2], [450, 720, 0.35], [600, 180, 0.1]] as const)
    svg += `<g transform="translate(${x} ${y})"><rect x="-14" y="-70" width="28" height="140" rx="4" fill="#161b22" stroke="#2f3944" stroke-width="2"/>` +
      `<rect class="rod" style="animation-delay:-${d}s" x="-6" y="-120" width="12" height="90" rx="3" fill="#56616d"/></g>`
  bg.innerHTML = `${svg}</svg><div class="vg-tx-light"></div><div class="vg-tx-fog"></div>`
  return bg
}

// ---------- the run ----------------------------------------------------
export function transformOut({ name, origin, audio }: { name?: string; origin: { x: number; y: number }; audio: AudioContext | null }): number {
  const vw = innerWidth, vh = innerHeight
  const H = Math.min(vh * 0.84, vw * 1.3), u = H / 100
  const cx = vw / 2, cy = vh * 0.5
  const X = (x: number) => cx + x * u, Y = (y: number) => cy + y * u
  const shell = (document.querySelector('.vg') ?? document.body) as HTMLElement
  const { grabs, chars, used } = harvest(shell, vw, vh)
  const events: SoundEvent[] = []
  const bursts: { t: number; x: number; y: number; n: number; dust?: boolean }[] = []
  const pan = (x: number) => Math.max(-0.9, Math.min(0.9, (x - cx) / (vw / 2)))

  // ---- the stage
  const root = h('div', 'vg-tx')
  root.dataset.scheme = SCHEMES[Math.floor(Math.random() * SCHEMES.length)]
  const bg = machinery()
  const shake = h('div', 'vg-tx-shake'), push = h('div', 'vg-tx-push'), rig = h('div', 'vg-tx-rig')
  const G: Record<Group | 'marks', HTMLElement> = {
    body: h('div', 'vg-tx-g'), chestL: h('div', 'vg-tx-g'), chestR: h('div', 'vg-tx-g'), head: h('div', 'vg-tx-g'), marks: h('div', 'vg-tx-g'),
  }
  rig.style.transformOrigin = `${cx}px ${Y(40)}px`
  G.head.style.transformOrigin = `${cx}px ${Y(-31)}px`
  G.chestL.style.transformOrigin = `${X(-10.85)}px ${Y(-21)}px`
  G.chestR.style.transformOrigin = `${X(10.85)}px ${Y(-21)}px`
  rig.append(G.body, G.chestL, G.chestR, G.head, G.marks)
  push.appendChild(rig); shake.appendChild(push)
  const fx = h('canvas', 'vg-tx-fx')
  const barT = h('div', 'vg-tx-bar top'), barB = h('div', 'vg-tx-bar bot')
  const sub = h('div', 'vg-tx-sub')
  const k1 = document.createElement('b'); k1.textContent = 'Signed out'
  const k2 = document.createElement('span'); k2.textContent = name ? `See you soon, ${name}` : 'See you soon'
  sub.append(k1, k2); barB.appendChild(sub)
  const flare = h('div', 'vg-tx-flare', `top:${Y(-38.6)}px`)
  const black = h('div', 'vg-tx-black')
  root.append(bg, shake, flare, fx, barT, barB, black)

  const ms = (s: number) => s * 1000
  const anim = (el: Element, kf: Keyframe[], at: number, dur: number, easing = 'cubic-bezier(.6,0,.2,1)', fill: FillMode = 'forwards') =>
    el.animate(kf, { delay: ms(at), duration: ms(dur), easing, fill })

  // ---- the frame (skeleton), in robot units
  const limb = (px: number, py: number) => { const d = h('div', 'vg-tx-limb', `transform-origin:${X(px)}px ${Y(py)}px`); return d }
  const bone = (p: HTMLElement, x1: number, y1: number, x2: number, y2: number, t: number, cls = 'vg-tx-bone') => {
    const len = Math.hypot(x2 - x1, y2 - y1) * u, ang = Math.atan2(y2 - y1, x2 - x1)
    p.appendChild(h('div', cls, `left:${X(x1)}px;top:${Y(y1) - (t * u) / 2}px;width:${len}px;height:${t * u}px;transform:rotate(${ang}rad)`))
  }
  const joint = (p: HTMLElement, x: number, y: number, r: number) => p.appendChild(h('div', 'vg-tx-joint', `left:${X(x) - r * u}px;top:${Y(y) - r * u}px;width:${2 * r * u}px;height:${2 * r * u}px`))
  const skel = h('div', 'vg-tx-g')
  G.body.appendChild(skel)
  for (const s of [-1, 1]) {
    const leg = limb(s * 5, 0)
    bone(leg, s * 5, 0, s * 6, 17, 2.4); bone(leg, s * 6, 17, s * 6.5, 36, 2.2); bone(leg, s * 6.5, 36, s * 9.5, 38.5, 1.6)
    bone(leg, s * 3.2, 2, s * 4.4, 15, 0.8, 'vg-tx-rod'); bone(leg, s * 4.6, 19, s * 4.8, 33, 0.8, 'vg-tx-rod')
    bone(leg, s * 7.4, 1, s * 8, 34, 0.22, 'vg-tx-line')
    joint(leg, s * 5, 0, 1.9); joint(leg, s * 6, 17, 1.8); joint(leg, s * 6.5, 36, 1.4)
    skel.appendChild(leg)
    anim(leg, [{ transform: `rotate(${s * -35}deg) scaleY(0.15)`, opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: 'scaleY(1.06)', offset: 0.75 }, { transform: 'none' }], TL.unfold.legs, 0.38, 'cubic-bezier(.3,0,.2,1)', 'both')
  }
  const spine = limb(0, 0)
  bone(spine, 0, 0, 0, -30, 3); bone(spine, -6, 0, 6, 0, 2.8); bone(spine, -13, -27, 13, -27, 2)
  for (const s of [-1, 1]) { bone(spine, 0, -24, s * 8, -18, 0.9); bone(spine, 0, -19, s * 7.5, -14, 0.9); bone(spine, 0, -14, s * 6.5, -10, 0.9); bone(spine, s * 1.8, -2, s * 1.8, -28, 0.22, 'vg-tx-line') }
  for (const y of [-4, -9, -14, -19, -24]) joint(spine, 0, y, 1.1)
  skel.appendChild(spine)
  anim(spine, [{ transform: 'scaleY(0)', opacity: 0 }, { opacity: 1, offset: 0.1 }, { transform: 'scaleY(1.08)', offset: 0.75 }, { transform: 'none' }], TL.unfold.spine, 0.36, 'cubic-bezier(.3,0,.2,1)', 'both')
  for (const s of [-1, 1]) {
    const arm = limb(s * 13, -27)
    bone(arm, s * 13, -27, s * 18, -11, 2.2); bone(arm, s * 18, -11, s * 21, 3, 2); bone(arm, s * 15, -24, s * 19.5, -14, 0.8, 'vg-tx-rod')
    bone(arm, s * 14.5, -27, s * 22, 3, 0.22, 'vg-tx-line')
    joint(arm, s * 13, -27, 2); joint(arm, s * 18, -11, 1.6); joint(arm, s * 21, 3, 1.3)
    skel.appendChild(arm)
    anim(arm, [{ transform: `rotate(${s * -160}deg) scale(0.4)`, opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: `rotate(${s * 10}deg)`, offset: 0.75 }, { transform: 'none' }], TL.unfold.arms, 0.4, 'cubic-bezier(.3,0,.2,1)', 'both')
  }
  const skull = limb(0, -31)
  bone(skull, 0, -29, 0, -34, 2.2)
  skull.appendChild(h('div', 'vg-tx-skull', `left:${X(-4)}px;top:${Y(-46.5)}px;width:${8 * u}px;height:${12 * u}px`))
  G.head.appendChild(skull)
  anim(skull, [{ transform: `translateY(${6 * u}px) scale(0.2)`, opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: 'none' }], TL.unfold.head, 0.34, 'cubic-bezier(.3,1.4,.4,1)', 'both')
  // Sparks where each part of the frame seats.
  for (const [t, pts] of [[TL.unfold.legs + 0.3, [[-6, 17], [6, 17]]], [TL.unfold.spine + 0.3, [[0, -27]]], [TL.unfold.arms + 0.32, [[-18, -11], [18, -11]]]] as const)
    for (const [x, y] of pts) bursts.push({ t, x: X(x), y: Y(y) + 3 * u, n: 10 })

  // Wheels roll in and seat on the calves and behind the shoulders.
  for (const [x, y, d] of [[-11, 30, 6.4], [11, 30, 6.4], [-20.5, -32, 5.6], [20.5, -32, 5.6]] as const) {
    const w = h('div', 'vg-tx-wheel', `left:${X(x) - (d * u) / 2}px;top:${Y(y) - (d * u) / 2}px;width:${d * u}px;height:${d * u}px`)
    G.body.appendChild(w)
    const t = TL.wheels + (y < 0 ? 0.25 : 0) + (x > 0 ? 0.06 : 0)
    anim(w, [{ transform: `translateX(${Math.sign(x) * vw * 0.7}px) rotate(${Math.sign(x) * -900}deg)` }, { transform: `translateX(${Math.sign(x) * -4}px) rotate(8deg)`, offset: 0.85 }, { transform: 'none' }], t, 0.55, 'cubic-bezier(.2,.7,.3,1)', 'both')
    events.push({ t: t + 0.5, kind: 'wheel', pan: pan(X(x)), size: 0.6 })
  }

  // ---- the pieces
  const T = (x: number, y: number, z: number, rz: number, ax: string, ra: number, sx: number, sy: number) =>
    `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateZ(${rz.toFixed(1)}deg) rotate${ax}(${ra.toFixed(1)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`

  const makePiece = (front: Node | null, x0: number, y0: number, w0: number, h0: number, sw: number, sh: number, paint: Paint, ax: 'X' | 'Y', label: string) => {
    const p = h('div', 'vg-tx-p', `left:${x0}px;top:${y0}px;width:${w0}px;height:${h0}px`)
    const f = h('div', front ? 'vg-tx-f' : 'vg-tx-b', front ? '' : 'inset:0')
    if (front) f.appendChild(front); else f.dataset.paint = paint
    // The back is built at its final size and pre-shrunk, so it lands crisp.
    const b = h('div', 'vg-tx-b', `left:${(w0 - sw) / 2}px;top:${(h0 - sh) / 2}px;width:${sw}px;height:${sh}px;transform:rotate${ax}(180deg) scale(${w0 / sw},${h0 / sh})`)
    b.dataset.paint = paint
    if (label) { const s = h('span', '', `font-size:${Math.max(6, Math.min(12, sh * 0.28))}px`); s.textContent = label; b.appendChild(s) }
    p.append(f, b)
    return p
  }

  interface Flight { p: HTMLElement; g: Group; o: number; c0: [number, number]; to: [number, number]; sx: number; sy: number; rz: number; ax: 'X' | 'Y'; back: boolean; lift: number; lock: number; side: number; size: number; primary: boolean }
  const flights: Flight[] = []
  const slots = robotSlots()
  const maxArea = Math.max(...slots.map(s => s.w * s.h))
  const bySize = [...slots].sort((a, b) => b.w * b.h - a.w * a.h)
  const lockAt = (s: Slot) => TL.lockFrom + (s.o / 11.7) * (TL.lockTo - TL.lockFrom) + (s.key.endsWith('R') ? 0.05 : 0)
  const maxD = Math.hypot(vw, vh)
  const liftAt = (x: number, y: number) => 0.12 + (Math.hypot(x - origin.x, y - origin.y) / maxD) * 0.8 + rnd(0, 0.05)
  const labelOf = (el: Element | null, i: number) => {
    const m = (el?.textContent || '').match(/\d{2,4}/)
    return m ? m[0] : String(i + 1).padStart(2, '0')
  }
  const hideOriginal = (el: Element) => { (el as HTMLElement).style.setProperty('visibility', 'hidden', 'important') }

  const place = (g: Grab | null, s: Slot, primary: boolean, i: number) => {
    const scale = primary ? 1 : rnd(0.55, 0.8)
    const ox = primary ? 0 : rnd(-0.18, 0.18) * s.w, oy = primary ? 0 : rnd(-0.18, 0.18) * s.h
    const sw = s.w * u * scale, sh = s.h * u * scale
    const side = Math.sign(s.x)
    let x0: number, y0: number, w0: number, h0: number, front: Node | null = null, back = true
    if (g) {
      x0 = g.r.left; y0 = g.r.top; w0 = g.r.width; h0 = g.r.height
      front = reid(snapshot(g.el))
      const cs = getComputedStyle(g.el)
      const solid = !clear(cs.backgroundColor) || cs.backgroundImage !== 'none' || g.el instanceof SVGElement || g.el instanceof HTMLImageElement
      const ratio = Math.max((w0 / h0) / (sw / sh), (sw / sh) / (w0 / h0))
      back = !(primary && solid && ratio < 1.45 && s.g !== 'head' && Math.random() < 0.8)
      hideOriginal(g.el)
    } else {
      w0 = sw; h0 = sh
      x0 = side < 0 ? -w0 - 60 : side > 0 ? vw + 60 : X(s.x) - w0 / 2 + rnd(-200, 200)
      y0 = side === 0 ? -h0 - 80 : rnd(-h0, vh)
    }
    const ax: 'X' | 'Y' = Math.random() < 0.5 ? 'X' : 'Y'
    const p = makePiece(front, x0, y0, w0, h0, sw, sh, primary ? s.paint : 'd', ax, primary && s.w * s.h > 30 ? labelOf(g?.el ?? null, i) : '')
    const lock = lockAt(s) - (primary ? 0 : 0.07)
    let lift = g ? liftAt(x0 + w0 / 2, y0 + h0 / 2) : rnd(0.4, 1.0)
    if (lock - lift < 1.0) lift = Math.max(0.1, lock - 1.0)
    flights.push({ p, g: s.g, o: s.o + (primary ? 0.01 : 0), c0: [x0 + w0 / 2, y0 + h0 / 2], to: [X(s.x + ox), Y(s.y + oy)], sx: sw / w0, sy: sh / h0, rz: s.r + (primary ? 0 : rnd(-6, 6)), ax, back, lift, lock, side, size: (s.w * s.h * scale * scale) / maxArea, primary })
  }
  const pool = [...grabs]
  bySize.forEach((s, i) => place(pool.shift() ?? null, s, true, i))
  // Anything left becomes a second layer of armour on the bigger plates…
  for (let i = 0; pool.length && i < 40; i++) place(pool.shift()!, bySize[i % Math.min(20, bySize.length)], false, i)
  // …and the rest is shed as debris.
  for (const g of pool) {
    const p = makePiece(reid(snapshot(g.el)), g.r.left, g.r.top, g.r.width, g.r.height, g.r.width, g.r.height, 'd', 'X', '')
    hideOriginal(g.el)
    G.body.appendChild(p)
    const t = liftAt(g.r.left + g.r.width / 2, g.r.top + g.r.height / 2)
    anim(p, [{ transform: 'none' }, { transform: T(0, -10, 60, 0, 'X', 0, 1.04, 1.04), offset: 0.15 }, { transform: T(rnd(-120, 120), vh + 200 - g.r.top, -200, rnd(-200, 200), 'X', rnd(-400, 400), 0.6, 0.6) }], t, 1.3, 'cubic-bezier(.5,0,.9,.6)', 'both')
    events.push({ t: t + 0.1, kind: 'lift', pan: pan(g.r.left), size: 0.2 }, { t: t + 0.7, kind: 'debris', pan: pan(g.r.left), size: 0.2 })
  }

  // Fly them: secondaries first so the primary plate sits on top.
  flights.sort((a, b) => a.o - b.o)
  for (const f of flights) {
    G[f.g].appendChild(f.p)
    const D = f.lock - f.lift, s = sgn(), s2 = sgn()
    const dx = f.to[0] - f.c0[0], dy = f.to[1] - f.c0[1]
    const F = f.back ? s * 180 : s * 360
    const ax0 = f.side * rnd(50, 90), ay0 = f.side === 0 ? rnd(40, 70) : rnd(-30, 30)
    const mx = dx * rnd(0.35, 0.55) + rnd(-140, 140), my = dy * rnd(0.35, 0.55) + rnd(-160, 60)
    const k = (x: number) => 1 - x / D
    anim(f.p, [
      { offset: 0, transform: T(0, 0, 0, 0, f.ax, 0, 1, 1), easing: 'cubic-bezier(.3,0,.2,1)' },
      { offset: 0.12 / D, transform: T(0, -10, 70, 0, f.ax, 0, 1.04, 1.04) },
      { offset: 0.19 / D, transform: T(0, -10, 70, 0, f.ax, 0, 1.04, 1.04), easing: 'cubic-bezier(.55,0,.25,1)' },
      { offset: 0.5, transform: T(mx, my, 160, rnd(-70, 70), f.ax, s * 120, 1 + (f.sx - 1) * 0.5, 1 + (f.sy - 1) * 0.5), easing: 'cubic-bezier(.55,0,.25,1)' },
      { offset: k(0.36), transform: T(dx + ax0, dy + ay0, 50, f.rz + s2 * 28, f.ax, F + s * 90, f.sx, f.sy) },
      { offset: k(0.3), transform: T(dx + ax0, dy + ay0, 50, f.rz + s2 * 28, f.ax, F + s * 90, f.sx, f.sy), easing: 'cubic-bezier(.6,0,.2,1)' },
      { offset: k(0.19), transform: T(dx + ax0 * 0.08, dy + ay0 * 0.08, 8, f.rz + s2 * 28, f.ax, F + s * 90, f.sx, f.sy), easing: 'cubic-bezier(.7,0,.3,1)' },
      { offset: k(0.07), transform: T(dx, dy, 0, f.rz - s2 * 5, f.ax, F - s * 12, f.sx, f.sy), easing: 'ease-out' },
      { offset: 1, transform: T(dx, dy, 0, f.rz, f.ax, F, f.sx, f.sy) },
    ], f.lift, D, 'linear', 'both')
    events.push({ t: f.lift, kind: 'lift', pan: pan(f.c0[0]), size: f.size })
    events.push({ t: f.lock, kind: 'lock', pan: pan(f.to[0]), size: f.size })
    if (f.primary) bursts.push({ t: f.lock, x: f.to[0], y: f.to[1] + 3 * u, n: 6 + Math.round(f.size * 14) })
  }

  // ---- the core, the eyes
  const core = h('div', 'vg-tx-core', `left:${X(0) - 3.8 * u}px;top:${Y(-21) - 3.8 * u}px;width:${7.6 * u}px;height:${7.6 * u}px`)
  G.body.appendChild(core)
  const eyes = [-1, 1].map(s => h('div', 'vg-tx-eye', `left:${X(s * 2.1) - 1.45 * u}px;top:${Y(-38.6) - 0.47 * u}px;width:${2.9 * u}px;height:${0.95 * u}px;transform:rotate(${-s * 8}deg)`))
  G.head.append(...eyes)

  // ---- letters and numbers → stencilled markings
  let ci = 0
  for (const row of MARK_ROWS) {
    const cap = Math.floor(row.len / (row.hgt * (row.v ? 1.05 : 0.7)))
    const n = Math.min(cap, chars.length - ci)
    for (let j = 0; j < n; j++, ci++) {
      const c = chars[ci]
      const step = (j - (n - 1) / 2) * row.hgt * (row.v ? 1.05 : 0.7)
      const rr = (row.r * Math.PI) / 180
      const tx = row.v ? X(row.x) : X(row.x + step * Math.cos(rr)), ty = row.v ? Y(row.y + step) : Y(row.y + step * Math.sin(rr))
      const el = h('div', 'vg-tx-ch', `left:${c.r.left}px;top:${c.r.top}px;width:${c.r.width}px;height:${c.r.height}px;line-height:${c.r.height}px;${c.css}color:${c.color}`)
      el.textContent = c.ch
      G.marks.appendChild(el)
      const kk = (row.hgt * u * 0.9) / c.r.height
      const dx = tx - (c.r.left + c.r.width / 2), dy = ty - (c.r.top + c.r.height / 2)
      const th = rnd(0, Math.PI * 2), R = rnd(0.3, 0.45) * Math.min(vw, vh)
      const ox = cx + Math.cos(th) * R - (c.r.left + c.r.width / 2), oy = Y(-10) + Math.sin(th) * R * 0.7 - (c.r.top + c.r.height / 2)
      const lift = liftAt(c.r.left, c.r.top), lock = TL.chars[0] + (ci / Math.max(1, chars.length)) * (TL.chars[1] - TL.chars[0])
      const D = lock - lift
      anim(el, [
        { offset: 0, transform: T(0, 0, 0, 0, 'Y', 0, 1, 1), color: c.color },
        { offset: 0.12 / D, transform: T(0, -12, 60, 0, 'Y', 0, 1.1, 1.1), color: c.color },
        { offset: 0.55, transform: T(ox, oy, 140, rnd(-180, 180), 'Y', 180, kk * 1.4, kk * 1.4), color: c.color },
        { offset: 0.86, transform: T(dx, dy - 14, 20, row.r + 12, 'Y', 340, kk, kk), color: '#f4f6f8' },
        { offset: 1, transform: T(dx, dy, 0, row.r, 'Y', 360, kk, kk), color: '#f4f6f8' },
      ], lift, D, 'cubic-bezier(.45,0,.25,1)', 'both')
      events.push({ t: lock, kind: 'char', pan: pan(tx), size: 0.05 })
    }
  }
  for (const el of used) hideOriginal(el)

  // ---- camera and the big beats
  const quake = (at: number, amp: number, dur = 0.35) => {
    const kf: Keyframe[] = []
    for (let i = 0; i < 9; i++) { const a = amp * (1 - i / 9); kf.push({ transform: `translate(${rnd(-a, a).toFixed(1)}px,${rnd(-a, a).toFixed(1)}px)` }) }
    kf.push({ transform: 'none' })
    anim(shake, kf, at, dur, 'linear', 'none')
  }
  quake(0.02, 7, 0.45)
  anim(shell, [{ filter: 'none' }, { filter: 'brightness(.3) blur(6px) saturate(.5)' }], 0.3, 0.7, 'ease-in')
  anim(bg, [{ opacity: 0 }, { opacity: 1 }], 0.35, 0.75, 'ease-out')
  anim(barT, [{ height: '0' }, { height: '7.5vh' }], 0.1, 0.45)
  anim(barB, [{ height: '0' }, { height: '7.5vh' }], 0.1, 0.45)
  // Crouched while it builds; stands at TL.stand.
  anim(rig, [{ transform: `translateY(${3 * u}px) rotateX(9deg) scale(.97)` }, { transform: `translateY(${-1.2 * u}px) rotateX(-2deg)`, offset: 0.8 }, { transform: 'none' }], TL.stand, TL.standEnd - TL.stand, 'cubic-bezier(.5,0,.3,1)', 'both')
  anim(push, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }], TL.stand, TL.crouch - TL.stand, 'ease-in-out', 'forwards')
  quake(TL.standEnd, 9, 0.5)
  bursts.push({ t: TL.standEnd, x: X(-7.5), y: Y(40), n: 16 }, { t: TL.standEnd, x: X(7.5), y: Y(40), n: 16 })
  for (const e of eyes) anim(e, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0.15, offset: 0.3 }, { opacity: 1, offset: 0.45 }, { opacity: 0.4, offset: 0.6 }, { opacity: 1 }], TL.eyes, 0.35, 'linear')
  anim(flare, [{ opacity: 0, transform: 'scaleX(.3)' }, { opacity: 1, transform: 'scaleX(1.1)', offset: 0.25 }, { opacity: 0, transform: 'scaleX(1.4)' }], TL.eyes + 0.05, 0.8, 'ease-out')
  anim(bg.querySelector('.vg-tx-light')!, [{ opacity: 0.35 }, { opacity: 1 }], TL.eyes, 0.4, 'ease-out')
  anim(G.chestL, [{ transform: 'none' }, { transform: `translateX(${-1.2 * u}px) rotateY(72deg)` }], TL.chest, 0.45, 'cubic-bezier(.5,0,.2,1.2)')
  anim(G.chestR, [{ transform: 'none' }, { transform: `translateX(${1.2 * u}px) rotateY(-72deg)` }], TL.chest, 0.45, 'cubic-bezier(.5,0,.2,1.2)')
  anim(core, [{ opacity: 0 }, { opacity: 0.3 }], TL.unfold.spine + 0.3, 0.4, 'ease-out', 'both')
  anim(core, [{ opacity: 0.3, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1.3)', offset: 0.5 }, { opacity: 1, transform: 'scale(1.1)' }], TL.chest + 0.1, 0.5, 'ease-out')
  anim(sub, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], TL.chest + 0.1, 0.4, 'ease-out')
  anim(G.head, [{ transform: 'none' }, { transform: 'rotateY(-22deg) rotateZ(-5deg)', offset: 0.35 }, { transform: 'rotateY(-22deg) rotateZ(-5deg)', offset: 0.6 }, { transform: 'none' }], TL.head, 0.55, 'cubic-bezier(.6,0,.3,1)', 'none')
  anim(rig, [
    { transform: 'none', easing: 'ease-out' },
    { transform: `translateY(${3.5 * u}px) scaleY(.94)`, offset: 0.3, easing: 'cubic-bezier(.5,0,.9,.4)' },
    { transform: `translateY(${-vh * 1.7}px) scaleY(1.1)` },
  ], TL.crouch, 0.62, 'linear')
  quake(TL.launch, 14, 0.6)
  bursts.push({ t: TL.launch, x: X(0), y: Y(40), n: 60, dust: true }, { t: TL.launch, x: X(0), y: Y(40), n: 30 })
  anim(black, [{ opacity: 0 }, { opacity: 1 }], TL.black, TL.end - TL.black - 0.1, 'ease-in')

  document.body.appendChild(root)
  if (audio) { try { transformSound(audio, events) } catch { /* sound is a nicety */ } }
  sparks(fx, vw, vh, bursts.sort((a, b) => a.t - b.t))
  return ms(TL.end)
}

// ---------- sparks and dust ----------------------------------------------
function sparks(cv: HTMLCanvasElement, vw: number, vh: number, bursts: { t: number; x: number; y: number; n: number; dust?: boolean }[]) {
  const dpr = Math.min(2, devicePixelRatio || 1)
  cv.width = vw * dpr; cv.height = vh * dpr
  const g = cv.getContext('2d')
  if (!g) return
  g.scale(dpr, dpr)
  type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; dust: boolean; r: number }
  const ps: P[] = []
  const start = performance.now()
  let i = 0, prev = start
  const frame = (now: number) => {
    const t = (now - start) / 1000, dt = Math.min(0.05, (now - prev) / 1000)
    prev = now
    while (i < bursts.length && bursts[i].t <= t) {
      const b = bursts[i++]
      for (let k = 0; k < b.n; k++) {
        if (b.dust) { const a = rnd(Math.PI * 0.95, Math.PI * 2.05), v = rnd(120, 520); ps.push({ x: b.x + rnd(-20, 20), y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.35, life: 0, max: rnd(0.6, 1.2), dust: true, r: rnd(8, 22) }) }
        else { const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), v = rnd(180, 620); ps.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.25, 0.6), dust: false, r: 0 }) }
      }
    }
    g.clearRect(0, 0, vw, vh)
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k]
      p.life += dt
      if (p.life > p.max) { ps.splice(k, 1); continue }
      const q = 1 - p.life / p.max
      if (p.dust) {
        p.vx *= 0.96; p.vy *= 0.96; p.x += p.vx * dt; p.y += p.vy * dt; p.r += 40 * dt
        g.globalCompositeOperation = 'source-over'
        g.fillStyle = `rgba(120,130,142,${(0.28 * q).toFixed(3)})`
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill()
      } else {
        p.vy += 1500 * dt; p.x += p.vx * dt; p.y += p.vy * dt
        g.globalCompositeOperation = 'lighter'
        g.strokeStyle = `rgba(255,${Math.round(150 + 105 * q)},${Math.round(90 * q)},${q.toFixed(3)})`
        g.lineWidth = 1.6
        g.beginPath(); g.moveTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022); g.lineTo(p.x, p.y); g.stroke()
      }
    }
    if (t < TL.end + 0.3) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
