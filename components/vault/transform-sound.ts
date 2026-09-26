// ============================================================
// components/vault/transform-sound.ts
//
// The sound of the sign-out transformation, and the timeline it shares
// with the animation (components/vault/transform-out.ts).
//
// Nothing is a recording. Every sound is built live with Web Audio from
// the same ingredients a film sound designer layers for a machine that
// rebuilds itself:
//   · struck steel — a noise transient exciting inharmonic partials
//     (the ratios of a free metal plate), with a low body thump
//   · latches — the double "chk-chk" of a mechanism seating
//   · servo motors — saw + square through a tracking band-pass, with the
//     ripple of a DC motor, gliding in pitch
//   · hydraulics, ratchets, scrapes, a metal-stress groan, a power-up
//     whine, and a launch
// All of it goes through stereo panning (each part clanks where it lands
// on screen), a synthetic reverb for size, and a limiter.
// ============================================================

/** The score: when each beat of the transformation happens, in seconds. */
export const TL = {
  unfold: { legs: 0.95, spine: 1.08, arms: 1.22, head: 1.36 },
  wheels: 1.45,
  lockFrom: 1.55,
  lockTo: 2.9,
  chars: [2.9, 3.25] as const,
  stand: 3.3,
  standEnd: 3.72,
  eyes: 3.78,
  chest: 3.98,
  head: 4.35,
  crouch: 4.95,
  launch: 5.12,
  black: 5.35,
  end: 5.85,
}

export interface SoundEvent {
  t: number
  kind: 'lift' | 'lock' | 'char' | 'wheel' | 'debris'
  pan: number   // −1 left … 1 right
  size: number  // 0 small … 1 the biggest plate
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export function transformSound(a: AudioContext, events: SoundEvent[]) {
  const t0 = a.currentTime + 0.03
  const at = (t: number) => t0 + Math.max(0, t)

  // ---- raw material: two seconds of noise, and a reverb tail
  const nb = a.createBuffer(1, a.sampleRate * 2, a.sampleRate)
  { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1 }
  const ir = a.createBuffer(2, Math.floor(a.sampleRate * 2.4), a.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.8)
  }

  // ---- the mix: limiter ← master ← (panned buses + reverb)
  const comp = a.createDynamicsCompressor()
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 10; comp.attack.value = 0.002; comp.release.value = 0.25
  comp.connect(a.destination)
  const master = a.createGain(); master.gain.value = 0.85; master.connect(comp)
  const verb = a.createConvolver(); verb.buffer = ir
  const wet = a.createGain(); wet.gain.value = 0.3; verb.connect(wet).connect(master)
  const buses = new Map<number, StereoPannerNode>()
  const bus = (pan = 0) => {
    const k = Math.round(Math.max(-1, Math.min(1, pan)) * 4) / 4
    let p = buses.get(k)
    if (!p) { p = a.createStereoPanner(); p.pan.value = k; p.connect(master); p.connect(verb); buses.set(k, p) }
    return p
  }

  // ---- building blocks
  const env = (g: GainNode, t: number, peak: number, atk: number, dur: number) => {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + atk)
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(atk + 0.005, dur))
  }
  const noise = (t: number, dur: number, into: AudioNode) => {
    const s = a.createBufferSource(); s.buffer = nb; s.connect(into)
    s.start(t, Math.random() * Math.max(0, 1.9 - dur)); s.stop(t + dur + 0.02)
  }
  const bq = (type: BiquadFilterType, f: number, q = 1) => { const b = a.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b }
  const osc = (type: OscillatorType, f: number) => { const o = a.createOscillator(); o.type = type; o.frequency.value = f; return o }
  const gain = () => a.createGain()

  /** Struck steel: a bright transient, inharmonic plate partials, a body thump. */
  const metal = (t: number, f: number, vol: number, pan: number, len: number) => {
    const out = bus(pan)
    const g1 = gain(); env(g1, t, vol * 0.9, 0.001, 0.035)
    const f1 = bq('bandpass', rnd(3000, 4600), 0.9); f1.connect(g1).connect(out); noise(t, 0.04, f1)
    ;[1, 1.59, 2.14, 2.65, 3.51, 4.39].forEach((k, i) => {
      const o = osc('sine', f * k * (1 + (Math.random() - 0.5) * 0.012)), g = gain()
      env(g, t, (vol * 0.26) / (1 + i * 0.7), 0.002, len * (1 - i * 0.1))
      o.connect(g).connect(out); o.start(t); o.stop(t + len + 0.05)
    })
    const b = osc('sine', f * 0.18 + 45), bg = gain()
    b.frequency.setValueAtTime(f * 0.18 + 45, t); b.frequency.exponentialRampToValueAtTime(40, t + 0.12)
    env(bg, t, vol * 0.7, 0.002, 0.14); b.connect(bg).connect(out); b.start(t); b.stop(t + 0.16)
  }
  /** The double click of a latch seating: chk-chk. */
  const chk = (t: number, vol: number, pan: number) => {
    const out = bus(pan)
    ;[0, 0.022].forEach((d, i) => {
      const f = bq('highpass', i ? 1800 : 2600, 0.7), g = gain()
      env(g, t + d, vol * (i ? 0.55 : 1), 0.0008, 0.018); f.connect(g).connect(out); noise(t + d, 0.025, f)
    })
  }
  /** A servo motor: gliding pitch, a tracking band-pass, and motor ripple. */
  const servo = (t: number, dur: number, f0: number, f1: number, vol: number, pan: number) => {
    const out = bus(pan)
    const o1 = osc('sawtooth', f0), o2 = osc('square', f0 * 2.003)
    for (const [o, m] of [[o1, 1], [o2, 2.003]] as const) {
      o.frequency.setValueAtTime(f0 * m, t)
      o.frequency.linearRampToValueAtTime((f0 + (f1 - f0) * 0.75) * m, t + dur * 0.35)
      o.frequency.exponentialRampToValueAtTime(f1 * m, t + dur)
    }
    const bp = bq('bandpass', f0 * 3, 2.5); bp.frequency.setValueAtTime(f0 * 3, t); bp.frequency.exponentialRampToValueAtTime(f1 * 3, t + dur)
    const amp = gain()
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vol, t + 0.015)
    amp.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.04)); amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const lfo = osc('sine', rnd(34, 58)), lg = gain(); lg.gain.value = vol * 0.45; lfo.connect(lg).connect(amp.gain)
    o1.connect(bp); o2.connect(bp); bp.connect(amp).connect(out)
    for (const o of [o1, o2, lfo]) { o.start(t); o.stop(t + dur + 0.02) }
  }
  /** Hydraulics venting. */
  const hiss = (t: number, dur: number, vol: number, pan: number) => {
    const f = bq('highpass', 2600, 0.7), p = bq('peaking', 5200, 1.5); p.gain.value = 6
    const g = gain(); env(g, t, vol, 0.02, dur); f.connect(p).connect(g).connect(bus(pan)); noise(t, dur, f)
  }
  /** Moving air, band-passed and swept. */
  const whoosh = (t: number, dur: number, vol: number, f0: number, f1: number, pan: number) => {
    const f = bq('bandpass', f0, 0.8); f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = gain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    f.connect(g).connect(bus(pan)); noise(t, dur, f)
  }
  /** A ratchet: small metal ticks that speed up. */
  const ratchet = (t: number, dur: number, n: number, pan: number, vol: number) => {
    const out = bus(pan)
    for (let i = 0; i < n; i++) {
      const tt = t + dur * Math.pow(i / n, 0.75)
      const f = bq('highpass', 3000, 0.8), g = gain(); env(g, tt, vol, 0.0008, 0.012); f.connect(g).connect(out); noise(tt, 0.015, f)
      const o = osc('sine', rnd(2200, 3200)), og = gain(); env(og, tt, vol * 0.3, 0.001, 0.03); o.connect(og).connect(out); o.start(tt); o.stop(tt + 0.04)
    }
  }
  /** Metal dragged on metal: resonant noise with a jittering centre. */
  const scrape = (t: number, dur: number, vol: number, pan: number) => {
    const f = bq('bandpass', 2400, 14)
    for (let x = 0; x < dur; x += 0.015) f.frequency.setValueAtTime(rnd(1700, 3400), t + x)
    const g = gain(); env(g, t, vol, 0.03, dur); f.connect(g).connect(bus(pan)); noise(t, dur, f)
  }
  /** Metal under stress: low detuned saws, driven, through a moving resonance. */
  const groan = (t: number, dur: number, vol: number) => {
    const sh = a.createWaveShaper(), n = 1024, c = new Float32Array(n)
    for (let i = 0; i < n; i++) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 3)
    sh.curve = c
    const bp = bq('bandpass', 140, 7)
    bp.frequency.setValueAtTime(140, t); bp.frequency.exponentialRampToValueAtTime(520, t + dur * 0.45); bp.frequency.exponentialRampToValueAtTime(180, t + dur)
    const lp = bq('lowpass', 1200), g = gain(); env(g, t, vol, 0.08, dur)
    sh.connect(bp).connect(lp).connect(g).connect(bus(0))
    for (const f of [36, 54.3, 72.5]) {
      const o = osc('sawtooth', f); o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.94, t + dur)
      o.connect(sh); o.start(t); o.stop(t + dur + 0.02)
    }
  }
  /** A heavy landing: a sub drop, a dark noise hit, a big steel ring. */
  const impact = (t: number, vol: number) => {
    const out = bus(0)
    const o = osc('sine', 72), g = gain(); o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(26, t + 0.9)
    env(g, t, vol, 0.004, 0.95); o.connect(g).connect(out); o.start(t); o.stop(t + 1)
    const f = bq('lowpass', 900, 0.7); f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(60, t + 0.5)
    const ng = gain(); env(ng, t, vol * 0.6, 0.003, 0.5); f.connect(ng).connect(out); noise(t, 0.5, f)
    metal(t, 140, vol * 0.5, 0, 1.3)
  }
  /** Eyes igniting: a rising electric whine, then a hum and a shimmer. */
  const powerUp = (t: number) => {
    const out = bus(0)
    for (const [type, f0, f1, v] of [['sine', 180, 2200, 0.12], ['triangle', 360, 4400, 0.05]] as const) {
      const o = osc(type, f0), g = gain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.4)
      env(g, t, v, 0.3, 0.5); o.connect(g).connect(out); o.start(t); o.stop(t + 0.55)
    }
    const lp = bq('lowpass', 700), hg = gain()
    hg.gain.setValueAtTime(0.0001, t + 0.3); hg.gain.exponentialRampToValueAtTime(0.06, t + 0.38); hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.5)
    lp.connect(hg).connect(out)
    for (const f of [110, 110.7]) { const o = osc('sawtooth', f); o.connect(lp); o.start(t + 0.3); o.stop(t + 1.55) }
    for (const f of [1760, 2637]) { const o = osc('sine', f), g = gain(); env(g, t + 0.35, 0.02, 0.01, 1.0); o.connect(g).connect(out); o.start(t + 0.35); o.stop(t + 1.4) }
  }
  /** Launch: a roar of air that opens up. */
  const jet = (t: number, dur: number) => {
    const lp = bq('lowpass', 300); lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(6000, t + dur * 0.6)
    const g = gain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    lp.connect(g).connect(bus(0)); noise(t, dur, lp)
    const bp = bq('bandpass', 900, 3); bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(2500, t + dur)
    const g2 = gain(); env(g2, t, 0.18, 0.05, dur); bp.connect(g2).connect(bus(0)); noise(t, dur, bp)
  }

  // ================= the score =================
  // The page cracks: a low thoom, a groan, air moving.
  impact(at(0.02), 0.45)
  groan(at(0), 1.0, 0.22)
  whoosh(at(0.05), 0.5, 0.12, 200, 1200, 0)

  // Every element breaking loose: a latch, often a servo chirp.
  let last = -1
  for (const e of events.filter(e => e.kind === 'lift').sort((x, y) => x.t - y.t)) {
    if (e.t - last < 0.028) continue
    last = e.t
    chk(at(e.t), 0.22, e.pan)
    if (Math.random() < 0.55) servo(at(e.t + 0.01), rnd(0.09, 0.16), rnd(260, 520), rnd(700, 1300), 0.03, e.pan)
  }
  // The machine at work while parts are in the air.
  for (let t = 0.3; t < 3.0; t += rnd(0.12, 0.22)) {
    const up = Math.random() < 0.6
    servo(at(t), rnd(0.12, 0.3), up ? rnd(160, 380) : rnd(600, 1100), up ? rnd(600, 1300) : rnd(180, 360), 0.035, rnd(-0.7, 0.7))
  }
  ;[0.55, 1.0, 1.7, 2.3, 2.75].forEach(t => ratchet(at(t), rnd(0.18, 0.3), 7 + Math.floor(Math.random() * 6), rnd(-0.6, 0.6), 0.12))
  ;[0.7, 1.9].forEach(t => scrape(at(t), 0.35, 0.07, rnd(-0.5, 0.5)))

  // The frame deploys: legs, spine, arms, head.
  Object.values(TL.unfold).forEach((t, i) => {
    servo(at(t - 0.05), 0.4, 90 + i * 20, 260 + i * 40, 0.07, 0)
    hiss(at(t), 0.3, 0.07, 0)
    chk(at(t + 0.3), 0.4, 0)
    metal(at(t + 0.33), 210 + i * 35, 0.5, 0, 0.8)
  })

  // Every plate locking home, where it lands.
  const locks = events.filter(e => e.kind === 'lock')
  const lv = locks.length > 50 ? 0.3 : 0.38
  for (const e of locks) {
    chk(at(e.t - 0.035), 0.3, e.pan)
    metal(at(e.t), (1500 / Math.sqrt(0.6 + e.size * 3)) * rnd(0.9, 1.1), lv * (0.6 + e.size * 0.6), e.pan, 0.25 + e.size * 0.35)
  }
  for (const e of events) {
    if (e.kind === 'char') { metal(at(e.t), rnd(2800, 4200), 0.07, e.pan, 0.07); chk(at(e.t), 0.1, e.pan) }
    if (e.kind === 'wheel') { ratchet(at(e.t - 0.45), 0.45, 10, e.pan, 0.08); metal(at(e.t), 420, 0.4, e.pan, 0.5) }
    if (e.kind === 'debris') metal(at(e.t), rnd(700, 1500), 0.12, e.pan, 0.3)
  }

  // It stands.
  groan(at(TL.stand), 0.55, 0.45)
  hiss(at(TL.stand), 0.5, 0.12, 0)
  servo(at(TL.stand), 0.4, 110, 420, 0.07, -0.3)
  servo(at(TL.stand + 0.05), 0.38, 130, 470, 0.07, 0.3)
  impact(at(TL.standEnd), 0.8)
  // The eyes.
  powerUp(at(TL.eyes - 0.3))
  // The chest opens.
  hiss(at(TL.chest), 0.35, 0.12, 0)
  chk(at(TL.chest), 0.4, -0.2); chk(at(TL.chest + 0.05), 0.4, 0.2)
  servo(at(TL.chest), 0.3, 200, 520, 0.05, 0)
  metal(at(TL.chest + 0.4), 520, 0.35, 0, 0.6)
  // A look.
  servo(at(TL.head), 0.22, 320, 560, 0.06, -0.2); chk(at(TL.head + 0.22), 0.3, -0.2)
  servo(at(TL.head + 0.28), 0.2, 560, 330, 0.06, 0.2); chk(at(TL.head + 0.5), 0.3, 0.2)
  // Crouch, and launch.
  hiss(at(TL.crouch), 0.2, 0.14, 0)
  servo(at(TL.crouch), 0.16, 400, 150, 0.07, 0)
  impact(at(TL.launch), 1.0)
  jet(at(TL.launch), 0.9)
  whoosh(at(TL.launch), 0.6, 0.25, 300, 4000, 0)
  ratchet(at(TL.launch + 0.05), 0.5, 14, 0, 0.1)
}
