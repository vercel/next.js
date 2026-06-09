// This module uses top-level await (TLA) to test that Turbopack/SWC
// properly transpiles async/await for older browser targets.
export const data = await Promise.resolve({ message: 'loaded' })
