// ============================================================
// components/birthday/letter.enc.ts
//
// The letter, encrypted. This file holds ONLY ciphertext — the
// words are not here in readable form, and they are not anywhere
// else in the repository. They are recovered in the browser, and
// only there, when the right secret is entered on the page.
//
// AES-256-GCM, key derived from the passphrase with PBKDF2
// (SHA-256, 150000 iterations). Regenerate with the throwaway
// script if the letter or the secret ever changes.
// ============================================================

export const LETTER_CIPHER = {
  v: 1,
  iterations: 150000,
  salt: 'moRHj3Kb0CwwnE12QZ/mjQ==',
  iv: 'rU+tTwINAgPhsOQP',
  data: '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',
} as const
