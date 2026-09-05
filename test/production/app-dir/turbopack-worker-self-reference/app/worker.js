// This worker spawns another instance of itself, so the worker chunk group
// references its own chunks. Worker chunk groups are created with
// `AvailabilityInfo::root()`, so unlike `import()` the reference is not unrolled
// by availability info and the reference ring stays closed.
if (!self.name) {
  new Worker(new URL('./worker.js', import.meta.url), { name: 'child' })
}

self.postMessage('ready')
