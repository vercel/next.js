globalThis.overflowEvalCounter ??= 0
globalThis.overflowEvalCounter++

const grow = (n) => grow(n + 1) + 1

// Only the first evaluation runs out of stack.
if (globalThis.overflowEvalCounter === 1) {
  grow(0)
}

export default 'evaluated'
