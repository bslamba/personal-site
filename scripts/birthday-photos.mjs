#!/usr/bin/env node
// ============================================================
// scripts/birthday-photos.mjs
//
// Fills /happy-birthday with photographs. However many you like —
// the page reads whatever this script produces, so adding more is
// a matter of running it again.
//
//   node scripts/birthday-photos.mjs --photos
//        Takes whatever is selected in Photos.app right now.
//        Select them in Photos, leave it open, run this.
//
//   node scripts/birthday-photos.mjs --album "Nishu"
//        Takes everything in that album. Make an album in Photos,
//        drag pictures into it whenever you think of one, re-run.
//
//   node scripts/birthday-photos.mjs ~/Downloads/birthday-photos
//        Takes a plain folder of image files.
//
//   node scripts/birthday-photos.mjs --album "Nishu" --check
//        Says what it would do and touches nothing.
//
// macOS only: it leans on `sips` and `osascript`, both of which
// are already on your Mac. The first --photos or --album run will
// raise a permission prompt asking to control Photos — that is
// macOS, and it only has to be answered once.
//
// For each picture it writes two files:
//   p-NN.jpg    long edge 1800 — the hero and the full-size view
//   p-NN-t.jpg  long edge  760 — the drifting cards
// The small one is what loads while she scrolls, so a gallery of
// forty photographs still opens quickly on a phone.
//
// Metadata is stripped on the way through, GPS included: these
// end up on a public web server.
//
// Captions you have edited by hand are kept. The script matches
// them by position and only invents a caption for a picture that
// does not have one yet.
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'media', 'birthday')
const MANIFEST = join(ROOT, 'components', 'birthday', 'photos.generated.ts')

const FULL_EDGE = 1800
const THUMB_EDGE = 760
const ACCEPTED = new Set([
  '.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.tif', '.tiff',
])

// Used only for pictures that do not already have a caption.
// Deliberately unspecific — they have to fit a photograph nobody
// has described to the script. Edit them freely afterwards; a
// caption you change by hand survives the next run.
const CAPTION_POOL = [
  'Every one of these is my favourite',
  'This one. Especially this one.',
  'Us, exactly as we are',
  'The way you look at me',
  'Somewhere in the middle of an ordinary day',
  'I remember what you said right after this',
  'That laugh',
  'My whole heart, standing right there',
  'Nothing special happening, and I was so happy',
  'You, mid-sentence, being wonderful',
  'Home is wherever this is',
  'I would live this day again',
  'Look at us',
  'The best thing in the room, as usual',
  'Ours',
  'Still my favourite person',
  'A perfectly ordinary, perfectly good day',
  'You make everything softer',
  'This is what lucky looks like',
  'I never want to stop taking these',
]

// Where the subject usually sits. Phone photographs put faces high
// in the frame, so an upright picture is anchored above centre and
// a wide one close to it — that is what stops a crop from cutting
// heads off. Change any of these per photo in the manifest.
const FOCUS_PORTRAIT = '50% 32%'
const FOCUS_LANDSCAPE = '50% 42%'

// ------------------------------------------------------------

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const detail = (error.stderr || error.stdout || error.message || '').toString().trim()
    throw new Error(detail || `${cmd} failed`)
  }
}

function sips(args) {
  return run('sips', args)
}

function osascript(source) {
  return run('osascript', ['-e', source])
}

/** Ask sips for a picture's pixel dimensions. */
function dimensions(file) {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', file])
  const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1])
  const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1])
  if (!width || !height) throw new Error(`could not read the size of ${file}`)
  return { width, height }
}

function imagesIn(dir) {
  return readdirSync(dir)
    .filter(name => !name.startsWith('.') && ACCEPTED.has(extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))
    .map(name => join(dir, name))
}

// ---------- getting the pictures out of Photos.app ----------

/**
 * Photos exports rendered copies rather than originals, which is
 * what we want: edits and crops are baked in, and HEIC arrives as
 * JPEG instead of something the web cannot show.
 */
function exportFromPhotos({ album }) {
  const stage = join(tmpdir(), `birthday-photos-${Date.now()}`)
  mkdirSync(stage, { recursive: true })

  const source = album
    ? `
        set matches to (every album whose name is ${JSON.stringify(album)})
        if (count of matches) is 0 then error "NO_ALBUM"
        set items_ to media items of (item 1 of matches)
      `
    : `
        set items_ to selection
        if (count of items_) is 0 then error "NO_SELECTION"
      `

  try {
    osascript(`
      tell application "Photos"
        ${source}
        export items_ to POSIX file ${JSON.stringify(stage)}
      end tell
    `)
  } catch (error) {
    const message = String(error.message)
    rmSync(stage, { recursive: true, force: true })

    if (message.includes('NO_ALBUM')) {
      fail(
        `Photos has no album called "${album}".\n` +
        '  Check the name in the Photos sidebar — it has to match exactly.'
      )
    }
    if (message.includes('NO_SELECTION')) {
      fail(
        'Nothing is selected in Photos.\n' +
        '  Open Photos, click the pictures you want (⌘-click for several),\n' +
        '  leave Photos open, and run this again.'
      )
    }
    if (message.includes('-1743') || message.toLowerCase().includes('not allowed')) {
      fail(
        'macOS has not granted permission to control Photos.\n' +
        '  System Settings → Privacy & Security → Automation → Terminal,\n' +
        '  switch Photos on, then run this again.'
      )
    }
    fail(`Photos could not export those pictures.\n  ${message}`)
  }

  return stage
}

// ---------- the manifest ----------

/** Read the captions already in the manifest so edits survive. */
function existingCaptions() {
  if (!existsSync(MANIFEST)) return []
  const source = readFileSync(MANIFEST, 'utf8')
  return [...source.matchAll(/caption: '((?:[^'\\]|\\.)*)'/g)].map(m =>
    m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
  )
}

const quote = value => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function writeManifest(entries) {
  const body = entries
    .map(photo => {
      const lines = [
        `    src: ${quote(photo.src)},`,
        `    thumb: ${quote(photo.thumb)},`,
        `    focus: ${quote(photo.focus)},`,
        `    caption: ${quote(photo.caption)},`,
      ]
      if (photo.portrait) lines.push('    portrait: true,')
      if (photo.hero) lines.push('    hero: true,')
      return `  {\n${lines.join('\n')}\n  },`
    })
    .join('\n')

  writeFileSync(
    MANIFEST,
    `// ============================================================\n` +
    `// components/birthday/photos.generated.ts\n` +
    `//\n` +
    `// Written by scripts/birthday-photos.mjs — but safe to edit.\n` +
    `//\n` +
    `// Three things are worth changing by hand:\n` +
    `//   caption  what the picture says when she taps it. Your\n` +
    `//            wording is kept when the script runs again.\n` +
    `//   focus    where the crop is anchored, as background-position.\n` +
    `//            Nudge the second number down if a face gets cut off\n` +
    `//            at the top, up if it gets cut off at the chin.\n` +
    `//   hero     whether this one takes a turn filling the screen\n` +
    `//            behind her name. Best on photographs with room\n` +
    `//            around the subject.\n` +
    `// ============================================================\n\n` +
    `import type { Photo } from './photos'\n\n` +
    `export const GENERATED: Photo[] = [\n${body}\n]\n`
  )
}

// ------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2)
  const check = argv.includes('--check')
  const args = argv.filter(a => a !== '--check')

  const usePhotos = args.includes('--photos')
  const albumFlag = args.indexOf('--album')
  const album = albumFlag !== -1 ? args[albumFlag + 1] : null
  const folderArg = args.find(a => !a.startsWith('--') && a !== album)

  if (albumFlag !== -1 && !album) fail('--album needs a name, e.g. --album "Nishu"')

  if (process.platform !== 'darwin') {
    fail('This script uses sips and osascript, so it has to run on your Mac.')
  }

  // ---- collect the originals ----
  let sourceDir
  let temporary = false

  if (usePhotos || album) {
    console.log(album ? `\n  Reading the "${album}" album from Photos…` : '\n  Reading your Photos selection…')
    sourceDir = exportFromPhotos({ album })
    temporary = true
  } else {
    sourceDir = resolve(folderArg ?? join(process.env.HOME ?? '~', 'Downloads', 'birthday-photos'))
    if (!existsSync(sourceDir)) {
      fail(
        `No such folder: ${sourceDir}\n` +
        '  Or skip folders entirely: select the pictures in Photos and run\n' +
        '      node scripts/birthday-photos.mjs --photos'
      )
    }
  }

  try {
    const originals = imagesIn(sourceDir)

    if (originals.length === 0) {
      fail(
        `Found no images in ${temporary ? 'that export' : sourceDir}.\n` +
        '  If you used --photos, make sure pictures were actually selected.'
      )
    }

    console.log(`  Found ${originals.length} photograph${originals.length === 1 ? '' : 's'}.`)

    if (check) {
      originals.forEach((file, i) => console.log(`   ${String(i + 1).padStart(3)}. ${basename(file)}`))
      console.log('\n  --check, so nothing was written.\n')
      return
    }

    // ---- rebuild the output folder from scratch ----
    // Otherwise a shorter run leaves the previous set's leftovers
    // sitting in public/ for ever.
    rmSync(OUT_DIR, { recursive: true, force: true })
    mkdirSync(OUT_DIR, { recursive: true })

    const captions = existingCaptions()
    const entries = []
    let bytes = 0

    originals.forEach((source, i) => {
      const stem = `p-${String(i + 1).padStart(2, '0')}`
      const full = join(OUT_DIR, `${stem}.jpg`)
      const thumb = join(OUT_DIR, `${stem}-t.jpg`)

      // -d profile drops the colour profile and, with it, the rest
      // of the metadata sips carries over — including GPS.
      const encode = (dest, edge, quality) =>
        sips([
          '-s', 'format', 'jpeg',
          '-s', 'formatOptions', String(quality),
          '-Z', String(edge),
          '-d', 'profile',
          source, '--out', dest,
        ])

      encode(full, FULL_EDGE, 82)
      encode(thumb, THUMB_EDGE, 72)

      const { width, height } = dimensions(full)
      const portrait = height > width

      bytes += readFileSync(full).length + readFileSync(thumb).length

      entries.push({
        src: `${stem}.jpg`,
        thumb: `${stem}-t.jpg`,
        focus: portrait ? FOCUS_PORTRAIT : FOCUS_LANDSCAPE,
        caption: captions[i] ?? CAPTION_POOL[i % CAPTION_POOL.length],
        portrait,
        // Six is enough for the cross-fade behind her name without
        // making the page carry a dozen full-size images up front.
        hero: i < 6,
      })

      const kb = Math.round(readFileSync(full).length / 1024)
      process.stdout.write(
        `   ${String(i + 1).padStart(3)}. ${basename(source).slice(0, 34).padEnd(34)} → ` +
        `${stem}.jpg  ${width}×${height}  ${portrait ? 'portrait ' : 'landscape'}  ${String(kb).padStart(4)}KB\n`
      )
    })

    writeManifest(entries)

    console.log(
      `\n  ${entries.length} photograph${entries.length === 1 ? '' : 's'} ready — ` +
      `${(bytes / 1048576).toFixed(1)}MB in public/media/birthday/`
    )
    console.log('  Captions and crops: components/birthday/photos.generated.ts')
    console.log('  Have a look at http://localhost:3000/happy-birthday, then commit.\n')
  } finally {
    if (temporary) rmSync(sourceDir, { recursive: true, force: true })
  }
}

main()
