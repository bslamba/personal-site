'use client'

// ============================================================
// components/ise/sheet-kit.tsx
//
// The dense presentational vocabulary every Cisco ISE topic
// sheet is built from.
//
// A sheet is authored against a fixed 1480px canvas and is then
// scaled to fit the viewport by <FitSheet>. That is what makes
// "everything on one screen, no scrolling" achievable: the type
// shrinks, the page never grows. So sizes here are deliberately
// absolute (px) rather than responsive — responsiveness is the
// scaler's job, not the panel's.
//
// Palette is the site's own: paper ground, ink text, signal red
// for anything that needs to be found quickly.
// ============================================================

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Maximize2, X } from 'lucide-react'

const HEAD = { fontFamily: 'var(--font-heading)' } as const
const MONO = { fontFamily: 'var(--font-mono)' } as const

// ------------------------------------------------------------
// Expanding a tile
//
// Click a panel and it takes the whole sheet to itself. Nothing
// is re-rendered somewhere else and nothing is duplicated: the
// other panels are simply hidden, so any selector state inside
// them survives, and this panel widens to all twelve columns.
//
// The sheet is then far shorter than it was, so the fit-to-screen
// scaler — which is already watching the content — scales it up
// on its own. That is where the larger type comes from. No second
// type scale to keep in step with the first.
// ------------------------------------------------------------
interface ExpandState {
  expanded: string | null
  toggle: (id: string) => void
  close: () => void
}

const ExpandContext = createContext<ExpandState>({
  expanded: null,
  toggle: () => {},
  close: () => {},
})

/** True when this sheet has a panel expanded. Rarely needed. */
export function useExpanded() {
  return useContext(ExpandContext).expanded
}

// A click that lands on a control belongs to the control, not to
// the tile — otherwise picking a probe would expand the panel.
function isInteractive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest('button, a, select, input, textarea, [role="button"]')
  )
}

// ------------------------------------------------------------
// Sheet — the master grid a topic lays its panels onto.
// 12 columns, matching the mental model of a print broadsheet.
// ------------------------------------------------------------
export function Sheet({
  children,
  gap = 7,
}: {
  children: React.ReactNode
  gap?: number
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const toggle = useCallback(
    (id: string) => setExpanded(current => (current === id ? null : id)),
    []
  )
  const close = useCallback(() => setExpanded(null), [])

  // Escape collapses the tile before it does anything else. The
  // listener is on the capture phase so it runs ahead of the
  // shell's own Escape handler, which would otherwise throw the
  // reader back to the hub in the same keystroke.
  React.useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      setExpanded(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [expanded])

  const value = useMemo(
    () => ({ expanded, toggle, close }),
    [expanded, toggle, close]
  )

  return (
    <ExpandContext.Provider value={value}>
      <div className="grid grid-cols-12 items-start" style={{ gap, ...HEAD }}>
        {children}
      </div>
    </ExpandContext.Provider>
  )
}

// ------------------------------------------------------------
// Panel — a titled box. `span` is columns out of 12.
// ------------------------------------------------------------
export function Panel({
  title,
  kicker,
  span = 4,
  tone = 'ink',
  children,
  right,
}: {
  title: string
  kicker?: string
  span?: number
  tone?: 'ink' | 'signal' | 'quiet'
  children: React.ReactNode
  right?: React.ReactNode
}) {
  const { expanded, toggle, close } = useContext(ExpandContext)

  // The title is the id. Titles are unique within a sheet, and
  // using one avoids threading an explicit key through every
  // panel in twenty-seven files.
  const id = title
  const isExpanded = expanded === id
  const isHidden = expanded !== null && !isExpanded

  const bar =
    tone === 'signal'
      ? 'bg-signal-500 text-white'
      : tone === 'quiet'
        ? 'bg-paper-dim text-ink-950 border-b border-ink-200'
        : 'bg-ink-950 text-paper'

  return (
    <section
      hidden={isHidden}
      onClick={e => {
        // Expanded panels close from the button or Escape only, so
        // that reading one does not collapse it by accident.
        if (isExpanded || isInteractive(e.target)) return
        toggle(id)
      }}
      className={`border bg-white ${
        isExpanded
          ? 'border-signal-500 shadow-[0_0_0_2px_rgba(211,0,45,0.12)]'
          : 'ise-tile cursor-zoom-in border-ink-200'
      }`}
      style={{
        gridColumn: isExpanded ? 'span 12 / span 12' : `span ${span} / span ${span}`,
      }}
    >
      <header
        className={`flex items-baseline justify-between gap-3 px-2 py-[4px] ${bar}`}
      >
        <h3
          className="truncate text-[11px] font-bold uppercase tracking-[0.13em]"
          style={HEAD}
        >
          {title}
        </h3>

        <span className="flex shrink-0 items-baseline gap-2">
          {(kicker || right) && (
            <span
              className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${
                tone === 'quiet' ? 'text-ink-400' : 'opacity-70'
              }`}
              style={HEAD}
            >
              {right ?? kicker}
            </span>
          )}

          {isExpanded ? (
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              title="Back to the whole sheet (Esc)"
              className={`-my-[3px] inline-flex items-center gap-1 px-1 py-[2px] text-[9px] font-bold uppercase tracking-[0.12em] ${
                tone === 'quiet'
                  ? 'text-ink-500 hover:text-signal-500'
                  : 'opacity-80 hover:opacity-100'
              }`}
              style={HEAD}
            >
              <X className="h-[11px] w-[11px]" aria-hidden="true" /> Close
            </button>
          ) : (
            <Maximize2
              className={`ise-tile-zoom h-[11px] w-[11px] ${
                tone === 'quiet' ? 'text-ink-400' : 'opacity-60'
              }`}
              aria-hidden="true"
            />
          )}
        </span>
      </header>

      <div className="px-2 py-1.5">{children}</div>
    </section>
  )
}

// ------------------------------------------------------------
// Prose — the small explanatory paragraph that opens a concept.
// ------------------------------------------------------------
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11.5px] leading-[1.42] text-ink-600" style={HEAD}>
      {children}
    </p>
  )
}

// A run of prose blocks with breathing room between them.
export function Stack({
  children,
  gap = 6,
}: {
  children: React.ReactNode
  gap?: number
}) {
  return (
    <div className="flex flex-col" style={{ gap }}>
      {children}
    </div>
  )
}

// ------------------------------------------------------------
// Table — the workhorse. Head row is ink, first column is
// emphasised, rows alternate on the paper tint.
// ------------------------------------------------------------
export function Table({
  head,
  rows,
  widths,
  accentFirst = true,
  align,
}: {
  head: React.ReactNode[]
  rows: React.ReactNode[][]
  widths?: (string | undefined)[]
  accentFirst?: boolean
  align?: ('left' | 'right' | 'center')[]
}) {
  return (
    <table className="w-full border-collapse text-[11px] leading-[1.35]" style={HEAD}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={i}
              className={`border-b border-ink-300 py-[2px] pl-0 pr-2 text-left align-bottom text-[9px] font-bold uppercase tracking-[0.08em] last:pr-0 ${
                accentFirst && i === 0 ? 'text-signal-600' : 'text-ink-500'
              }`}
              style={{ width: widths?.[i], textAlign: align?.[i] ?? 'left' }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className={ri % 2 ? 'bg-paper-dim/60' : undefined}>
            {r.map((c, ci) => (
              <td
                key={ci}
                className={`border-b border-ink-100 py-[2px] pl-0 pr-2 align-top last:pr-0 ${
                  ci === 0
                    ? 'font-semibold text-ink-950'
                    : 'text-ink-600'
                }`}
                style={{ textAlign: align?.[ci] ?? 'left' }}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ------------------------------------------------------------
// KV — label/value pairs, for the "what is it" facts.
// ------------------------------------------------------------
export function KV({
  items,
  labelWidth = 108,
}: {
  items: [React.ReactNode, React.ReactNode][]
  labelWidth?: number
}) {
  return (
    <dl className="text-[11px] leading-[1.38]" style={HEAD}>
      {items.map(([k, v], i) => (
        <div
          key={i}
          className={`flex gap-1.5 border-b border-ink-100 py-[2px] ${
            i === items.length - 1 ? 'border-b-0' : ''
          }`}
        >
          <dt
            className="shrink-0 font-bold uppercase tracking-[0.07em] text-signal-600"
            style={{ width: labelWidth, fontSize: 9, paddingTop: 1.5 }}
          >
            {k}
          </dt>
          <dd className="min-w-0 flex-1 text-ink-700">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

// ------------------------------------------------------------
// Bullets — a tight list with signal-red markers.
// ------------------------------------------------------------
export function Bullets({
  items,
  cols = 1,
}: {
  items: React.ReactNode[]
  cols?: 1 | 2 | 3
}) {
  return (
    <ul
      className="text-[11px] leading-[1.38] text-ink-600"
      style={{
        ...HEAD,
        columnCount: cols,
        columnGap: 12,
      }}
    >
      {items.map((it, i) => (
        <li
          key={i}
          className="relative mt-[2px] break-inside-avoid pl-[9px] first:mt-0"
        >
          <span className="absolute left-0 top-[5.5px] h-[3px] w-[3px] bg-signal-500" />
          {it}
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------
// Code — a configuration block. Terminal-dark, like the blog's
// <pre>, with an optional caption strip.
// ------------------------------------------------------------
export function Code({
  title,
  code,
  maxHeight,
}: {
  title?: string
  code: string
  maxHeight?: number
}) {
  return (
    <figure className="border border-ink-800">
      {title && (
        <figcaption
          className="border-b border-ink-800 bg-ink-900 px-1.5 py-[2px] text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-300"
          style={HEAD}
        >
          {title}
        </figcaption>
      )}
      <pre
        className="overflow-hidden bg-ink-950 px-1.5 py-1 text-[10px] leading-[1.4] text-ink-100"
        style={{ ...MONO, maxHeight }}
      >
        <code>{code}</code>
      </pre>
    </figure>
  )
}

// Inline monospace, for a command, attribute name or port.
export function M({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="bg-signal-50 px-[3px] py-px text-[9.5px] text-signal-700"
      style={MONO}
    >
      {children}
    </code>
  )
}

// ------------------------------------------------------------
// Steps — a numbered procedure.
// ------------------------------------------------------------
export function Steps({
  items,
  cols = 1,
}: {
  items: React.ReactNode[]
  cols?: 1 | 2
}) {
  return (
    <ol
      className="text-[11px] leading-[1.38] text-ink-600"
      style={{ ...HEAD, columnCount: cols, columnGap: 12 }}
    >
      {items.map((it, i) => (
        <li
          key={i}
          className="relative mt-[3px] break-inside-avoid pl-[18px] first:mt-0"
        >
          <span
            className="absolute left-0 top-0 text-[9px] font-bold text-signal-500"
            style={{ ...HEAD, width: 15 }}
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          {it}
        </li>
      ))}
    </ol>
  )
}

// ------------------------------------------------------------
// Pill / Badge — status and category chips.
// ------------------------------------------------------------
export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: 'good' | 'warn' | 'bad' | 'neutral' | 'signal'
  children: React.ReactNode
}) {
  const map = {
    good: 'bg-[#E1F5EE] text-[#085041]',
    warn: 'bg-[#FAEEDA] text-[#633806]',
    bad: 'bg-signal-50 text-signal-700',
    neutral: 'bg-ink-100 text-ink-600',
    signal: 'bg-signal-500 text-white',
  } as const
  return (
    <span
      className={`inline-block whitespace-nowrap px-[5px] py-px text-[8.5px] font-bold uppercase tracking-[0.08em] ${map[tone]}`}
      style={HEAD}
    >
      {children}
    </span>
  )
}

// ------------------------------------------------------------
// Note — the aside that stops someone making a mistake.
// ------------------------------------------------------------
export function Note({
  label = 'Note',
  tone = 'signal',
  children,
}: {
  label?: string
  tone?: 'signal' | 'warn' | 'good'
  children: React.ReactNode
}) {
  const edge =
    tone === 'warn'
      ? 'border-l-[#C77A08] bg-[#FAEEDA]/50'
      : tone === 'good'
        ? 'border-l-[#0B7A62] bg-[#E1F5EE]/50'
        : 'border-l-signal-500 bg-paper-dim'
  const text =
    tone === 'warn'
      ? 'text-[#633806]'
      : tone === 'good'
        ? 'text-[#085041]'
        : 'text-signal-700'
  return (
    <div className={`border-l-[3px] px-1.5 py-[4px] text-[11px] leading-[1.38] ${edge}`}>
      <span
        className={`mr-1.5 align-[1px] text-[8.5px] font-bold uppercase tracking-[0.12em] ${text}`}
        style={HEAD}
      >
        {label}
      </span>
      <span className="text-ink-700" style={HEAD}>
        {children}
      </span>
    </div>
  )
}

// ------------------------------------------------------------
// Flow — a left-to-right chevron sequence. For phase diagrams
// and anything that reads as "this, then this, then this".
// ------------------------------------------------------------
export function Flow({
  steps,
}: {
  steps: { label: string; detail?: React.ReactNode; tone?: 'signal' | 'ink' }[]
}) {
  return (
    <div className="flex items-stretch gap-[3px]">
      {steps.map((s, i) => (
        <div key={i} className="relative min-w-0 flex-1">
          <div
            className={`h-full px-2 py-1 ${
              s.tone === 'signal'
                ? 'bg-signal-500 text-white'
                : 'bg-ink-950 text-paper'
            }`}
            style={{
              clipPath:
                i === steps.length - 1
                  ? 'polygon(0 0, calc(100% - 0px) 0, 100% 50%, calc(100% - 0px) 100%, 0 100%, 8px 50%)'
                  : i === 0
                    ? 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)'
                    : 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)',
              paddingLeft: i === 0 ? 8 : 14,
            }}
          >
            <div
              className="text-[9.5px] font-bold uppercase tracking-[0.09em]"
              style={HEAD}
            >
              {s.label}
            </div>
            {s.detail && (
              <div
                className="mt-[1px] text-[9px] leading-[1.35] opacity-75"
                style={HEAD}
              >
                {s.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// Ladder — a packet-flow diagram.
//
// Actors run across the top with dashed lifelines beneath them;
// each step is an arrow between two actors carrying a label.
// This is the shape most ISE flows actually have (supplicant →
// authenticator → ISE → AD), and it survives being scaled down
// far better than a boxes-and-arrows drawing.
// ------------------------------------------------------------
export type LadderStep = {
  from: number
  to: number
  label: React.ReactNode
  sub?: React.ReactNode
  tone?: 'signal' | 'ink' | 'muted'
  dashed?: boolean
}

export function Ladder({
  actors,
  steps,
  columns = 1,
}: {
  actors: string[]
  steps: LadderStep[]
  /**
   * Break a long flow into side-by-side columns, numbering
   * continuing across them. A twenty-three step exchange in one
   * column is either unreadably tall or unreadably small; in
   * three it is neither.
   */
  columns?: 1 | 2 | 3
  /** @deprecated rows now size themselves to their content */
  rowHeight?: number
}) {
  if (columns > 1) {
    const perColumn = Math.ceil(steps.length / columns)
    const chunks: { steps: LadderStep[]; offset: number }[] = []
    for (let i = 0; i < steps.length; i += perColumn) {
      chunks.push({ steps: steps.slice(i, i + perColumn), offset: i })
    }
    return (
      <div
        className="grid items-start"
        style={{
          gridTemplateColumns: `repeat(${chunks.length}, minmax(0,1fr))`,
          columnGap: 14,
        }}
      >
        {chunks.map((chunk, i) => (
          <LadderColumn
            key={i}
            actors={actors}
            steps={chunk.steps}
            offset={chunk.offset}
          />
        ))}
      </div>
    )
  }

  return <LadderColumn actors={actors} steps={steps} offset={0} />
}

function LadderColumn({
  actors,
  steps,
  offset,
}: {
  actors: string[]
  steps: LadderStep[]
  offset: number
}) {
  const n = actors.length

  // Every step is a real grid row rather than an absolutely
  // positioned block, so a long label simply makes its own row
  // taller instead of colliding with the step beneath it. The
  // arrow runs centre-to-centre between two lifelines: the cell
  // spans whole columns, then half a column of padding on each
  // side pulls the ends back to the centres.
  return (
    <div className="relative">
      <div
        className="relative z-10 grid"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: 3 }}
      >
        {actors.map((a, i) => (
          <div
            key={i}
            className="truncate bg-ink-950 px-1 py-[3px] text-center text-[9.5px] font-bold uppercase tracking-[0.06em] text-paper"
            style={HEAD}
            title={a}
          >
            {a}
          </div>
        ))}
      </div>

      <div className="relative" style={{ paddingTop: 3 }}>
        {Array.from({ length: n }).map((_, i) => (
          <span
            key={i}
            className="pointer-events-none absolute bottom-0 top-0 border-l border-dashed border-ink-300"
            style={{ left: `calc(${((i + 0.5) / n) * 100}% - 0.5px)` }}
            aria-hidden="true"
          />
        ))}

        <div
          className="relative grid"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, rowGap: 3 }}
        >
          {steps.map((s, i) => {
            const lo = Math.min(s.from, s.to)
            const hi = Math.max(s.from, s.to)
            const rtl = s.to < s.from
            const self = s.from === s.to
            const spanCols = hi - lo + 1

            // Half a column of padding on each side pulls the ends
            // of the arrow back to the two lifelines it runs
            // between. A message an actor sends to itself has no
            // second lifeline to reach, so that same padding would
            // crush it to a slice a few pixels wide and wrap its
            // label one word per line — it gets the whole column.
            const inset = self ? '3%' : `${50 / spanCols}%`
            const color =
              s.tone === 'signal'
                ? 'var(--color-signal-500)'
                : s.tone === 'muted'
                  ? 'var(--color-ink-400)'
                  : 'var(--color-ink-800)'

            return (
              <div
                key={i}
                style={{
                  gridColumn: `${lo + 1} / ${hi + 2}`,
                  gridRow: i + 1,
                  paddingLeft: inset,
                  paddingRight: inset,
                }}
              >
                <div
                  className="text-center text-[9.5px] font-semibold leading-[1.25]"
                  style={{ ...HEAD, color }}
                >
                  <span className="mr-[3px] text-[8.5px] opacity-55">
                    {String(offset + i + 1).padStart(2, '0')}
                  </span>
                  {s.label}
                </div>

                <div className="relative mt-[1px] flex items-center">
                  {!self && rtl && <Head dir="left" color={color} />}
                  <span
                    className="flex-1"
                    style={{
                      borderTop: `${
                        s.dashed ? '1px dashed' : self ? '1px dotted' : '1.2px solid'
                      } ${color}`,
                    }}
                  />
                  {!self && !rtl && <Head dir="right" color={color} />}
                  {self && (
                    <span
                      className="ml-[2px] text-[9px] leading-none"
                      style={{ color }}
                      aria-label="acts on itself"
                    >
                      ↻
                    </span>
                  )}
                </div>

                {s.sub && (
                  <div
                    className="mt-[1px] text-center text-[8.5px] leading-[1.25] text-ink-400"
                    style={HEAD}
                  >
                    {s.sub}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Head({ dir, color }: { dir: 'left' | 'right'; color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 0,
        height: 0,
        borderTop: '3px solid transparent',
        borderBottom: '3px solid transparent',
        [dir === 'right' ? 'borderLeft' : 'borderRight']: `4.5px solid ${color}`,
      }}
    />
  )
}

// ------------------------------------------------------------
// Selector — the segmented control that drives every "pick your
// scenario and I'll show you that configuration" panel.
// ------------------------------------------------------------
export function Selector<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: { id: T; label: string; hint?: string }[]
  value: T
  onChange: (v: T) => void
  label?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {label && (
        <span
          className="text-[8.5px] font-bold uppercase tracking-[0.13em] text-ink-400"
          style={HEAD}
        >
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-[3px]">
        {options.map(o => {
          const on = o.id === value
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              title={o.hint}
              aria-pressed={on}
              className={`border transition-colors ${
                size === 'sm'
                  ? 'px-[6px] py-[2px] text-[8.5px]'
                  : 'px-2 py-[3px] text-[9.5px]'
              } font-bold uppercase tracking-[0.08em] ${
                on
                  ? 'border-signal-500 bg-signal-500 text-white'
                  : 'border-ink-200 bg-white text-ink-500 hover:border-ink-400 hover:text-ink-900'
              }`}
              style={HEAD}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Split — two stacked halves inside one panel, with a rule and
// a small caption for each. Used constantly for "type A vs
// type B" explanations.
// ------------------------------------------------------------
export function Split({
  parts,
  cols = 2,
}: {
  parts: { title: string; children: React.ReactNode }[]
  cols?: 1 | 2 | 3 | 4
}) {
  return (
    <div
      className="grid gap-x-2.5 gap-y-1.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
    >
      {parts.map((p, i) => (
        <div key={i} className="min-w-0">
          <div
            className="mb-[3px] border-b border-ink-300 pb-[1px] text-[9px] font-bold uppercase tracking-[0.1em] text-ink-950"
            style={HEAD}
          >
            {p.title}
          </div>
          {p.children}
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// Stat — a single number that matters, poster sized.
// ------------------------------------------------------------
export function Stat({
  value,
  label,
  sub,
}: {
  value: React.ReactNode
  label: string
  sub?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <div
        className="text-[19px] leading-none text-signal-500"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
      <div
        className="mt-[3px] text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-400"
        style={HEAD}
      >
        {label}
      </div>
      {sub && (
        <div className="mt-[1px] text-[9px] leading-[1.35] text-ink-500" style={HEAD}>
          {sub}
        </div>
      )}
    </div>
  )
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-5 gap-y-2">{children}</div>
}

// ------------------------------------------------------------
// Matrix — a coloured grid, for the TrustSec egress policy and
// anything else that is genuinely a matrix rather than a table.
// ------------------------------------------------------------
export function Matrix({
  cols,
  rows,
  cell,
}: {
  cols: string[]
  rows: string[]
  cell: (r: number, c: number) => { label?: string; tone: 'permit' | 'deny' | 'limit' | 'none' }
}) {
  const tones = {
    permit: 'bg-[#E1F5EE] text-[#085041]',
    deny: 'bg-signal-50 text-signal-700',
    limit: 'bg-[#FAEEDA] text-[#633806]',
    none: 'bg-white text-ink-300',
  } as const
  return (
    <table className="w-full border-collapse text-[9px]" style={HEAD}>
      <thead>
        <tr>
          <th className="border border-ink-200 bg-ink-950 px-1 py-[2px] text-left text-[8px] uppercase tracking-[0.08em] text-paper">
            Src ╲ Dst
          </th>
          {cols.map(c => (
            <th
              key={c}
              className="border border-ink-200 bg-ink-800 px-1 py-[2px] text-center text-[8px] font-semibold uppercase tracking-[0.05em] text-paper"
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={r}>
            <th className="border border-ink-200 bg-paper-dim px-1 py-[2px] text-left text-[8px] font-semibold text-ink-950">
              {r}
            </th>
            {cols.map((_, ci) => {
              const v = cell(ri, ci)
              return (
                <td
                  key={ci}
                  className={`border border-ink-200 px-1 py-[2px] text-center font-semibold ${tones[v.tone]}`}
                >
                  {v.label ?? ''}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
