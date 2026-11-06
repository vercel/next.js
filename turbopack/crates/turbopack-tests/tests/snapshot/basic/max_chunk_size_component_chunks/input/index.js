// Each shared module is used by a different pair of pages, so each one ends up in its own small
// chunk that gets merged with the others. The merged chunk is bigger than `maxChunkSize` and is
// split again, without component chunks.
import('./pages/p1.js').then(({ p1 }) => console.log(p1))
import('./pages/p2.js').then(({ p2 }) => console.log(p2))
import('./pages/p3.js').then(({ p3 }) => console.log(p3))
