// ============================================================
// lib/slug.ts
//
// One slugify, shared by the markdown renderer (which stamps id=
// onto every heading) and the study hub (which links a sub-item to
// that heading's anchor). They MUST agree, so both import this.
// ============================================================

/** Heading text -> URL anchor. Matches the id= put on <h2>/<h3>. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}
