// ============================================================
// lib/tools/tar.ts
//
// Streaming tar reader.
//
// A support bundle expands to a couple of gigabytes, so nothing
// here ever holds the archive. Entries arrive one at a time and
// the caller decides whether to read the body or skip it — and
// skipping means the bytes are discarded as they pass, not
// buffered and thrown away.
//
// Tar is simple enough not to warrant a dependency: 512-byte
// headers, body padded to a 512-byte boundary, two zero blocks
// at the end.
// ============================================================

const BLOCK = 512

export interface TarHeader {
  name: string
  size: number
  /** '0' file · '5' directory · 'L' GNU long name · 'x' pax header */
  type: string
}

function str(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset
  const limit = offset + length
  while (end < limit && bytes[end] !== 0) end++
  let s = ''
  for (let i = offset; i < end; i++) s += String.fromCharCode(bytes[i])
  return s
}

function octal(bytes: Uint8Array, offset: number, length: number): number {
  const s = str(bytes, offset, length).trim()
  if (!s) return 0
  // GNU base-256 encoding for large values
  if (bytes[offset] & 0x80) {
    let v = 0
    for (let i = offset + 1; i < offset + length; i++) v = v * 256 + bytes[i]
    return v
  }
  const v = parseInt(s, 8)
  return Number.isFinite(v) ? v : 0
}

function isZeroBlock(b: Uint8Array): boolean {
  for (let i = 0; i < b.length; i++) if (b[i] !== 0) return false
  return true
}

export class TarReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private buf: Uint8Array = new Uint8Array(0)
  private done = false
  /** total bytes pulled from the underlying stream, for progress */
  consumed = 0

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader()
  }

  private async pull(): Promise<boolean> {
    if (this.done) return false
    const { value, done } = await this.reader.read()
    if (done || !value) { this.done = true; return false }
    this.consumed += value.byteLength
    if (this.buf.length === 0) {
      this.buf = value
    } else {
      const merged = new Uint8Array(this.buf.length + value.length)
      merged.set(this.buf, 0)
      merged.set(value, this.buf.length)
      this.buf = merged
    }
    return true
  }

  /** Exactly n bytes, or null at end of stream. */
  private async take(n: number): Promise<Uint8Array | null> {
    while (this.buf.length < n) {
      if (!(await this.pull())) return null
    }
    const out = this.buf.subarray(0, n)
    this.buf = this.buf.subarray(n)
    return out
  }

  /** Discard n bytes without assembling them. */
  private async drop(n: number): Promise<void> {
    let remaining = n
    while (remaining > 0) {
      if (this.buf.length === 0 && !(await this.pull())) return
      const take = Math.min(remaining, this.buf.length)
      this.buf = this.buf.subarray(take)
      remaining -= take
    }
  }

  /** Next header, or null at end of archive. */
  async next(): Promise<TarHeader | null> {
    let longName: string | null = null

    for (;;) {
      const head = await this.take(BLOCK)
      if (!head) return null
      if (isZeroBlock(head)) {
        // one zero block is usually followed by another; either way we are done
        return null
      }

      const rawName = str(head, 0, 100)
      const size = octal(head, 124, 12)
      const type = String.fromCharCode(head[156] || 0x30)
      const prefix = str(head, 345, 155)
      let name = prefix ? `${prefix}/${rawName}` : rawName

      // GNU long name: this entry's body holds the real name
      if (type === 'L') {
        const body = await this.take(Math.ceil(size / BLOCK) * BLOCK)
        if (!body) return null
        longName = str(body, 0, size)
        continue
      }
      // pax extended header — skip it and use the following entry
      if (type === 'x' || type === 'g') {
        await this.drop(Math.ceil(size / BLOCK) * BLOCK)
        continue
      }

      if (longName) { name = longName; longName = null }
      return { name: name.replace(/^\.\//, ''), size, type }
    }
  }

  /**
   * Stream the current entry's body in chunks. Padding to the next
   * 512-byte boundary is consumed automatically.
   */
  async readBody(size: number, onChunk: (chunk: Uint8Array) => void): Promise<void> {
    let remaining = size
    while (remaining > 0) {
      if (this.buf.length === 0 && !(await this.pull())) break
      const take = Math.min(remaining, this.buf.length)
      onChunk(this.buf.subarray(0, take))
      this.buf = this.buf.subarray(take)
      remaining -= take
    }
    const pad = (BLOCK - (size % BLOCK)) % BLOCK
    if (pad) await this.drop(pad)
  }

  async skipBody(size: number): Promise<void> {
    await this.drop(size + ((BLOCK - (size % BLOCK)) % BLOCK))
  }

  async cancel(): Promise<void> {
    try { await this.reader.cancel() } catch { /* already closed */ }
  }
}

/**
 * Turns byte chunks into lines without accumulating the whole file.
 * The tail is carried between chunks; `flush` emits whatever is left.
 */
export class LineSplitter {
  private decoder = new TextDecoder('utf-8', { fatal: false })
  private tail = ''

  constructor(private onLine: (line: string) => void) {}

  push(chunk: Uint8Array): void {
    const text = this.tail + this.decoder.decode(chunk, { stream: true })
    let start = 0
    for (;;) {
      const i = text.indexOf('\n', start)
      if (i === -1) break
      const line = text.charCodeAt(i - 1) === 13
        ? text.slice(start, i - 1)
        : text.slice(start, i)
      this.onLine(line)
      start = i + 1
    }
    this.tail = text.slice(start)
  }

  flush(): void {
    if (this.tail) { this.onLine(this.tail); this.tail = '' }
  }
}
