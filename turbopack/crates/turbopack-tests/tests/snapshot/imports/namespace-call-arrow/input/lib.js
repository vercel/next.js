// An arrow has no `this` of its own, so calling it through the namespace does not need the
// namespace as a receiver.
export const arrowFn = (x) => x * 2

// A function declaration that never reaches `this` is equally safe.
export function plainFn(x) {
  return x + 1
}

// This one observes `this`, so the namespace has to stay the receiver.
export function methodLike() {
  return this === undefined ? 'no-this' : 'has-this'
}
