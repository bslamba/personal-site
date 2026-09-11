'use client'

// ============================================================
// components/birthday/letter-lock.tsx
//
// The letter, kept for one person.
//
// The page opens behind a secret entered on the cover. The letter
// is the part that must stay unreadable even to a peek at the page
// source, so it ships encrypted (see letter.enc.ts): its words are
// not in the source in any readable form. The same secret that
// opens the cover decrypts it, in the browser and only there.
//
// AES-256-GCM, the key stretched from the passphrase with PBKDF2.
// The secret is never stored — not in the page, not in the browser,
// not anywhere — so the letter asks for it every single time it is
// opened, which is what was wanted.
// ============================================================

import { LETTER_CIPHER } from './letter.enc'

export type Block =
  | { t: 'to'; x: string }
  | { t: 'p'; x: string }
  | { t: 'big'; x: string }
  | { t: 'sign'; name: string; role: string }

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

export async function decryptLetter(passphrase: string): Promise<Block[]> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase).buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(LETTER_CIPHER.salt),
      iterations: LETTER_CIPHER.iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  // A wrong passphrase fails the GCM auth tag and throws here — which
  // is exactly how we know the secret was wrong, without ever having
  // to store the secret to compare against.
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(LETTER_CIPHER.iv) },
    key,
    fromBase64(LETTER_CIPHER.data)
  )
  return JSON.parse(new TextDecoder().decode(plain)) as Block[]
}

export function Letter({ blocks }: { blocks: Block[] }) {
  return (
    <div className="bday-letter-card">
      {blocks.map((b, i) => {
        if (b.t === 'to') return <p key={i} className="bday-letter-to">{b.x}</p>
        if (b.t === 'big') return <p key={i} className="bday-letter-big">{b.x}</p>
        if (b.t === 'sign') {
          return (
            <p key={i} className="bday-letter-sign">
              <span className="bday-signature">{b.name}</span>
              <span className="bday-signature-role">{b.role}</span>
            </p>
          )
        }
        return <p key={i}>{b.x}</p>
      })}
    </div>
  )
}
