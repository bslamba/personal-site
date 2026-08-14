// Minimal shim. The package is a TypeScript rewrite and may ship
// its own types; this guarantees a build either way, and costs
// nothing because guide.tsx casts to its own Agent interface.
declare module 'clippyjs' {
  export function initAgent(agent: unknown): Promise<unknown>
}
declare module 'clippyjs/agents' {
  export const Rover: unknown
  export const Links: unknown
  export const Clippy: unknown
  export const Merlin: unknown
  export const Genius: unknown
  export const Rocky: unknown
}
