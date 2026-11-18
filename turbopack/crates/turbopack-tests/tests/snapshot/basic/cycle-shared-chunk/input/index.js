// Two chunk groups that enter the same import cycle (ring-a -> ring-b -> ring-c -> ring-a)
// at different modules. Both need the same set of modules, but reach them in a different
// order, which must not result in two copies of the shared chunk.
import('./entry-a').then(({ a }) => console.log(a()))
import('./entry-b').then(({ b }) => console.log(b()))
