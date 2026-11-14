globalThis.overflowRequireCounter ??= 0
globalThis.overflowRequireCounter++

const grow = (n) => grow(n + 1) + 1

// Only the first evaluation runs out of stack.
if (globalThis.overflowRequireCounter === 1) {
  grow(0)
}

module.exports = 'evaluated'
