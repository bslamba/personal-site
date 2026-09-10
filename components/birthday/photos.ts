// ============================================================
// components/birthday/photos.ts
//
// The shape of a photograph, and the list the page renders.
//
// The list itself lives in ./photos.generated.ts, which is written
// by:
//     node scripts/birthday-photos.mjs --photos
//
// Adding more pictures means running that again — nothing here
// needs touching, and the page takes however many there are.
// ============================================================

import { GENERATED } from './photos.generated'

export interface Photo {
  /** Full-size file under /media/birthday/ — hero and lightbox. */
  src: string
  /** Small file under /media/birthday/ — the drifting cards. */
  thumb: string
  /**
   * object-position for a fill crop. A face near the top of a tall
   * phone photo gets cut off by the default centre crop, so every
   * picture says where its subject actually is.
   */
  focus: string
  /** Shown in the lightbox and read by screen readers. */
  caption: string
  /** Upright photos get a taller card in the drifting rail. */
  portrait?: boolean
  /** The ones that take a turn filling the screen behind her name. */
  hero?: boolean
}

export const PHOTOS: Photo[] = GENERATED

/**
 * The pictures the hero cross-fade cycles through — falling back to
 * the whole set if nothing has been marked, so the hero is never
 * blank just because every `hero` flag was switched off by hand.
 */
export const HERO_PHOTOS: Photo[] =
  PHOTOS.filter(p => p.hero).length > 0 ? PHOTOS.filter(p => p.hero) : PHOTOS

/** Whether there are any photographs at all yet. */
export const HAS_PHOTOS = PHOTOS.length > 0
