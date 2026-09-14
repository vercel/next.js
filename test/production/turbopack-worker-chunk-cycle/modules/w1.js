// This worker spawns itself, which makes the worker chunk group reference its
// own chunks. Worker chunk groups are created with `AvailabilityInfo::root()`,
// so (unlike `import()`) the recursion is not unrolled by availability info.
const child = new Worker(new URL('./w1.js', import.meta.url))
child.terminate()
self.postMessage('ready')
