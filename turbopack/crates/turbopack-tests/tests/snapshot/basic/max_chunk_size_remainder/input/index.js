// `page.js` uses all shared modules, and each shared module is also used by one other page. So each
// shared module is its own small chunk in the chunk group of `page.js`, which is not merged with the
// others (merging is not beneficial with the tiny request cost). They all end up in the remained
// chunk, but together they are bigger than `maxChunkSize`, so they form multiple remained chunks
// instead, split between the `a` and `b` directories. Each remained chunk is a merged chunk and
// emits its components as component chunks.
import('./page.js').then(({ page }) => console.log(page))
import('./other/a1.js').then(({ other }) => console.log(other))
import('./other/a2.js').then(({ other }) => console.log(other))
import('./other/a3.js').then(({ other }) => console.log(other))
import('./other/b1.js').then(({ other }) => console.log(other))
import('./other/b2.js').then(({ other }) => console.log(other))
import('./other/b3.js').then(({ other }) => console.log(other))
