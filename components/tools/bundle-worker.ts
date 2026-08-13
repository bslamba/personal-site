// ============================================================
// components/tools/bundle-worker.ts
//
// Opens an encrypted Cisco ISE support bundle inside the browser.
//
//   .tar.gpg  →  OpenPGP symmetric decrypt  →  streaming tar
//             →  line-by-line parse of the files we care about
//             →  a few hundred KB of report
//
// It runs in a Web Worker because a bundle expands to a couple of
// gigabytes and decrypting that on the main thread would freeze
// the tab for minutes.
//
// Nothing is written to disk and nothing leaves the machine. The
// passphrase exists only as a local variable for the duration of
// the decrypt.
// ============================================================

import * as openpgp from 'openpgp'
import { TarReader, LineSplitter } from '@/lib/tools/tar'
import { BundleAggregator } from '@/lib/tools/bundle-analyse'
import { specFor } from '@/lib/tools/bundle-registry'
import type { WorkerOut } from '@/lib/tools/bundle-types'

const post = (m: WorkerOut) => self.postMessage(m)

self.onmessage = async (e: MessageEvent<{ file: File; passphrase: string; includeBulk: boolean }>) => {
  const { file, passphrase, includeBulk } = e.data

  // Progress is measured on the ENCRYPTED input rather than on anything
  // downstream. It is the only number that is honest end to end: the
  // archive's decompressed size is unknown until it has been read, so a
  // bar based on output would lie for the first few minutes.
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
  }, 400)

  try {
    post({ type: 'stage', stage: 'Reading the archive' })

    // The counting stage is what drives the progress bar. It measures the
    // file as it is consumed, which is the only figure that is honest for
    // the whole run — the decompressed size is unknown until the end.
    const counted = (file.stream() as unknown as ReadableStream<Uint8Array>)
      .pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          inBytes += chunk.byteLength
          controller.enqueue(chunk)
        },
      }))

    // ---------- decrypt, unless it is already a plain tar ----------
    // An unencrypted .tar skips OpenPGP entirely. That matters: decryption
    // is by far the slowest step here, because it runs AES-CFB in
    // JavaScript — WebCrypto has no CFB implementation to hand off to.
    // Decrypting with gpg first and dropping the .tar in is several times
    // faster overall, for exactly this reason.
    let plaintext: ReadableStream<Uint8Array>
    const alreadyPlain = /\.tar$/i.test(file.name) && !/\.(gpg|pgp)$/i.test(file.name)

    if (alreadyPlain) {
      post({ type: 'stage', stage: 'Reading logs' })
      plaintext = counted
    } else {
      const message = await openpgp.readMessage({ binaryMessage: counted })

      post({ type: 'stage', stage: 'Decrypting' })

      let decrypted
      try {
        decrypted = await openpgp.decrypt({
          message,
          passwords: [passphrase],
          format: 'binary',
          config: {
            // The integrity check happens at the end of the stream.
            // Allowing data through as it arrives is what makes this
            // streaming rather than a 2GB buffer; a corrupt archive
            // still throws at the end.
            allowUnauthenticatedStream: true,
          },
        })
      } catch (err) {
        clearInterval(ticker)
        const msg = String(err instanceof Error ? err.message : err)
        if (/passphrase|password|decrypt|session key/i.test(msg)) {
          post({ type: 'error', message: 'That key did not open the bundle. Check the shared key you set when creating it. If the filename contains "-pk-" it is public-key encrypted and only Cisco TAC can open it.' })
        } else {
          post({ type: 'error', message: `Could not decrypt: ${msg}` })
        }
        return
      }

      plaintext = decrypted.data as unknown as ReadableStream<Uint8Array>
    }

    // ---------- walk the archive ----------
    post({ type: 'stage', stage: 'Reading files from the archive' })

    if (!alreadyPlain) post({ type: 'stage', stage: 'Reading logs' })

    const started = Date.now()
    const agg = new BundleAggregator()
    const tar = new TarReader(plaintext)

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
      post({ type: 'error', message: 'The archive decrypted but contained no files. It may not be a tar archive.' })
      return
    }
    if (agg.filesRead.length === 0) {
      clearInterval(ticker)
      post({ type: 'error', message: `Decrypted ${entries} files, but none of the expected ISE logs were present. Is this a Cisco ISE support bundle?` })
      return
    }

    post({ type: 'stage', stage: 'Building the report' })
    const report = agg.finish(file.name, (Date.now() - started) / 1000)
    clearInterval(ticker)
    post({ type: 'done', report })
  } catch (err) {
    clearInterval(ticker)
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'The bundle could not be read.',
    })
  } finally {
    clearInterval(ticker)
  }
}
