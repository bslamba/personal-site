// ============================================================
// components/tools/bundle-worker.ts
//
// Reads a Cisco ISE support bundle archive and produces a report.
//
//   .tar  →  streaming tar walk  →  line-by-line parse of the
//            logs that matter  →  a few hundred KB of summary
//
// It runs in a Web Worker because a bundle is a couple of
// gigabytes and doing this on the main thread would freeze the
// tab. Nothing is written to disk and nothing leaves the machine.
//
// WHY THERE IS NO DECRYPTION HERE
// An earlier version decrypted .tar.gpg in the browser with
// OpenPGP.js. It was measured at roughly 6 KB/s — about two and a
// half hours for a 344MB bundle. The cause is structural rather
// than fixable: OpenPGP must run AES-CFB, the Web Crypto API does
// not implement CFB, so the cipher falls back to JavaScript and
// then feeds a two-gigabyte decompression stream.
//
// gpg on the user's own machine does the same work with native
// code in about fifteen seconds, so decryption belongs there. The
// page asks for a decrypted .tar and skips straight to parsing.
// ============================================================

import { TarReader, LineSplitter } from '@/lib/tools/tar'
import { BundleAggregator } from '@/lib/tools/bundle-analyse'
import { specFor } from '@/lib/tools/bundle-registry'
import type { WorkerOut } from '@/lib/tools/bundle-types'

const post = (m: WorkerOut) => self.postMessage(m)

self.onmessage = async (e: MessageEvent<{ file: File; includeBulk: boolean }>) => {
  const { file, includeBulk } = e.data

  let inBytes = 0
  let outBytes = 0
  let currentEntry: string | null = null
  let filesParsed = 0
  let linesParsed = 0

  const ticker = setInterval(() => {
    post({
      type: 'progress',
      inBytes, inTotal: file.size, outBytes,
      entry: currentEntry, files: filesParsed, lines: linesParsed,
    })
  }, 300)

  try {
    post({ type: 'stage', stage: 'Reading the archive' })

    // Counting the input drives the progress bar. Because the archive is
    // already plaintext, bytes consumed maps directly onto work done —
    // no guessing at a decompressed size.
    const stream = (file.stream() as unknown as ReadableStream<Uint8Array>)
      .pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          inBytes += chunk.byteLength
          controller.enqueue(chunk)
        },
      }))

    const started = Date.now()
    const agg = new BundleAggregator()
    const tar = new TarReader(stream)
    let entries = 0

    // One callback reused across every file — allocating a closure per
    // log matters when a bundle holds hundreds of rotations.
    const feed = (l: string) => { linesParsed++; agg.line(l) }

    for (;;) {
      const header = await tar.next()
      if (!header) break
      entries++
      outBytes = tar.consumed

      if (header.type === '5' || header.size === 0) {
        await tar.skipBody(header.size)
        continue
      }

      const spec = specFor(header.name)

      if (!spec || (spec.bulk && !includeBulk)) {
        // Everything we do not need is discarded as its bytes pass.
        await tar.skipBody(header.size)
        continue
      }

      currentEntry = header.name
      filesParsed++
      agg.startFile(spec, header.name, header.size)

      if (spec.role === 'showtech') {
        let text = ''
        const d = new TextDecoder('utf-8', { fatal: false })
        await tar.readBody(header.size, chunk => { text += d.decode(chunk, { stream: true }) })
        agg.appendShowtech(text)
      } else {
        const splitter = new LineSplitter(feed)
        await tar.readBody(header.size, chunk => splitter.push(chunk))
        splitter.flush()
      }
    }

    await tar.cancel()
    agg.archiveEntries = entries
    outBytes = tar.consumed

    if (entries === 0) {
      clearInterval(ticker)
      post({
        type: 'error',
        message: 'No files were found inside this archive. If the name ends in .gpg it is still encrypted — decrypt it first with: gpg --output bundle.tar --decrypt yourbundle.tar.gpg',
      })
      return
    }
    if (agg.filesRead.length === 0) {
      clearInterval(ticker)
      post({
        type: 'error',
        message: `Read ${entries} files, but none of the expected ISE logs were present. Is this a Cisco ISE support bundle?`,
      })
      return
    }

    post({ type: 'stage', stage: 'Building the report' })
    const report = agg.finish(file.name, (Date.now() - started) / 1000)
    clearInterval(ticker)
    post({ type: 'done', report })
  } catch (err) {
    clearInterval(ticker)
    const msg = err instanceof Error ? err.message : 'The archive could not be read.'
    post({
      type: 'error',
      message: /invalid|unexpected|corrupt/i.test(msg)
        ? `${msg} — if this file is still encrypted, decrypt it first with: gpg --output bundle.tar --decrypt yourbundle.tar.gpg`
        : msg,
    })
  } finally {
    clearInterval(ticker)
  }
}
