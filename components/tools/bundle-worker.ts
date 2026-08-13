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

self.onmessage = async (e: MessageEvent<{ file: File; passphrase: string }>) => {
  const { file, passphrase } = e.data

  try {
    post({ type: 'stage', stage: 'Reading the archive' })

    // ---------- decrypt ----------
    // The file is handed over as a stream, so the 344MB of ciphertext
    // is never held whole — and neither is the plaintext it expands to.
    const message = await openpgp.readMessage({
      binaryMessage: file.stream() as unknown as ReadableStream<Uint8Array>,
    })

    post({ type: 'stage', stage: 'Decrypting' })

    let decrypted
    try {
      decrypted = await openpgp.decrypt({
        message,
        passwords: [passphrase],
        format: 'binary',
        config: {
          // The integrity check happens at the end of the stream. Allowing
          // the data through as it arrives is what makes this streaming
          // rather than a 2GB buffer; a corrupt archive still throws.
          allowUnauthenticatedStream: true,
        },
      })
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err)
      if (/passphrase|password|decrypt|session key/i.test(msg)) {
        post({ type: 'error', message: 'That key did not open the bundle. Check the shared key you set when creating it. If the filename contains "-pk-" it is public-key encrypted and only Cisco TAC can open it.' })
      } else {
        post({ type: 'error', message: `Could not decrypt: ${msg}` })
      }
      return
    }

    const plaintext = decrypted.data as unknown as ReadableStream<Uint8Array>

    // ---------- walk the archive ----------
    post({ type: 'stage', stage: 'Reading files from the archive' })

    const started = Date.now()
    const agg = new BundleAggregator()
    const tar = new TarReader(plaintext)

    let lastPost = 0
    let entries = 0

    // One splitter reused across files — allocating a closure per log
    // matters when there are hundreds of rotations.
    const feed = (l: string) => agg.line(l)
    const dec = () => new TextDecoder('utf-8', { fatal: false })

    for (;;) {
      const header = await tar.next()
      if (!header) break
      entries++

      if (header.type === '5' || header.size === 0) {
        await tar.skipBody(header.size)
        continue
      }

      const spec = specFor(header.name)

      if (!spec) {
        // Everything we do not need is discarded as its bytes pass.
        await tar.skipBody(header.size)
      } else {
        agg.startFile(spec, header.name, header.size)

        if (spec.role === 'showtech') {
          let text = ''
          const d = dec()
          await tar.readBody(header.size, chunk => { text += d.decode(chunk, { stream: true }) })
          agg.appendShowtech(text)
        } else {
          const splitter = new LineSplitter(feed)
          await tar.readBody(header.size, chunk => splitter.push(chunk))
          splitter.flush()
        }
      }

      const now = Date.now()
      if (now - lastPost > 200) {
        lastPost = now
        post({ type: 'progress', bytes: tar.consumed, entry: header.name })
      }
    }

    await tar.cancel()
    agg.archiveEntries = entries

    if (entries === 0) {
      post({ type: 'error', message: 'The archive decrypted but contained no files. It may not be a tar archive.' })
      return
    }
    if (agg.filesRead.length === 0) {
      post({ type: 'error', message: `Decrypted ${entries} files, but none of the expected ISE logs were present. Is this a Cisco ISE support bundle?` })
      return
    }

    post({ type: 'stage', stage: 'Building the report' })
    const report = agg.finish(file.name, (Date.now() - started) / 1000)
    post({ type: 'done', report })
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'The bundle could not be read.',
    })
  }
}
