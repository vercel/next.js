globalThis.importOverflowCounter ??= 0
globalThis.importOverflowCounter++

const grow = (n) => grow(n + 1) + 1

// Only the first evaluation runs out of stack.
if (globalThis.importOverflowCounter === 1) {
  grow(0)
}

export default 'evaluated'
