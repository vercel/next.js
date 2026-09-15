// This module is loaded via dynamic import() on the server, so it lands in its
// own chunk under server/chunks/ rather than the entry chunk. Editing it (or
// adding a new import to it) changes that chunk's content hash and therefore its
// path — the exact "availability info / chunk rename" scenario, but for a
// dynamically-imported chunk instead of the synchronous entry chunk graph.
export const lazyValue = 'lazy-v0'
