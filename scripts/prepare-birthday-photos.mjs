#!/usr/bin/env node
// ============================================================
// scripts/prepare-birthday-photos.mjs
//
// Turns a folder of original photographs into the nine optimised
// files that /happy-birthday expects.
//
//     node scripts/prepare-birthday-photos.mjs ~/Downloads/birthday-photos
//
// It uses `sips`, which ships with macOS, so there is nothing to
// install. HEIC straight off an iPhone is fine; so is JPEG, PNG
// and WebP.
//
// What it does:
//   · sorts the originals by file name and takes the first nine
//   · converts each to JPEG, honouring the EXIF rotation
//   · caps the longest edge at 2000px and strips the metadata
//     (which is where the GPS coordinates live — these are going
//     onto a public web server)
//   · writes public/media/birthday/<slot>.jpg
//   · rewrites the `portrait` flags in components/birthday/photos.ts
//     to match the real shapes, because the drifting rail gives
//     upright photos a taller card
//
// The page crops with object-fit: cover and an object-position
// taken from `focus` in photos.ts, so nothing is cropped here —
// the whole frame is kept and the browser chooses what to show.
// If a face ends up cut off, move that photo's `focus` rather than
// re-cutting the file.
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'media', 'birthday')
const PHOTOS_TS = join(ROOT, 'components', 'birthday', 'photos.ts')

// The order the slots are filled, which is the order photos.ts
// lists them. Sorted file names map onto this one for one, so
// naming the originals 1.jpg … 9.jpg puts them exactly where you
// want them.
const SLOTS = [
  'us-01', 'us-02', 'us-03', 'us-04', 'us-05',
  'you-01', 'you-02', 'you-03', 'collage-love',
]

const ACCEPTED = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.tif', '.tiff'])
const MAX_EDGE = 2000

function sips(args) {
  return execFileSync('sips', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Ask sips for a picture's pixel dimensions. */
function dimensions(file) {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', file])
  const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1])
  const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1])
  if (!width || !height) throw new Error(`could not read the size of ${file}`)
  return { width, height }
}

function main() {
  const srcDir = resolve(process.argv[2] ?? join(process.env.HOME ?? '~', 'Downloads', 'birthday-photos'))

  if (!existsSync(srcDir)) {
    console.error(`\n  No such folder: ${srcDir}`)
    console.error('  Put the photographs in it, or pass the folder as an argument.\n')
    process.exit(1)
  }

  if (process.platform !== 'darwin') {
    console.error('\n  This script uses sips, which is macOS only.\n')
    process.exit(1)
  }

  const originals = readdirSync(srcDir)
    .filter(name => !name.startsWith('.') && ACCEPTED.has(extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))

  if (originals.length === 0) {
    console.error(`\n  Found no images in ${srcDir}\n`)
    process.exit(1)
  }

  if (originals.length !== SLOTS.length) {
    console.warn(
      `\n  Note: found ${originals.length} image(s), the page has ${SLOTS.length} slots. ` +
      `Filling ${Math.min(originals.length, SLOTS.length)} of them.\n`
    )
  }

  mkdirSync(OUT_DIR, { recursive: true })

  const shapes = new Map()
  const count = Math.min(originals.length, SLOTS.length)

  for (let i = 0; i < count; i++) {
    const slot = SLOTS[i]
    const src = join(srcDir, originals[i])
    const dest = join(OUT_DIR, `${slot}.jpg`)

    // One pass: re-encode as JPEG, resample the long edge, and
    // drop everything that is not pixels.
    sips([
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', '82',
      '-Z', String(MAX_EDGE),
      '-d', 'profile',
      src, '--out', dest,
    ])

    const { width, height } = dimensions(dest)
    const portrait = height > width
    shapes.set(slot, portrait)

    const kb = Math.round(readFileSync(dest).length / 1024)
    console.log(
      `  ${String(i + 1).padStart(2)}. ${basename(originals[i]).padEnd(38)} → ` +
      `${slot}.jpg  ${width}×${height}  ${portrait ? 'portrait' : 'landscape'}  ${kb}KB`
    )
  }

  // ---- keep photos.ts honest about the real shapes ----
  let source = readFileSync(PHOTOS_TS, 'utf8')
  let changed = 0

  for (const [slot, portrait] of shapes) {
    // Match this photo's object literal, from its src to its
    // closing brace, and set the flag inside it.
    const entry = new RegExp(`(\\{[^{}]*src: '${slot}\\.jpg'[^{}]*\\})`, 'm')
    const found = entry.exec(source)
    if (!found) continue

    let block = found[1]
    const has = /portrait: (true|false),?/.test(block)
    const next = portrait
      ? (has ? block.replace(/portrait: (true|false)/, 'portrait: true')
             : block.replace(/(\n\s*)(hero:|\})/, `$1portrait: true,$1$2`))
      : block.replace(/\n\s*portrait: (true|false),?/, '')

    if (next !== block) {
      source = source.replace(block, next)
      changed++
    }
  }

  if (changed > 0) {
    writeFileSync(PHOTOS_TS, source)
    console.log(`\n  Updated ${changed} portrait flag(s) in components/birthday/photos.ts`)
  }

  console.log(`\n  Done — ${count} photo(s) in public/media/birthday/`)
  console.log('  Check them at http://localhost:3000/happy-birthday, then commit.\n')
}

main()
