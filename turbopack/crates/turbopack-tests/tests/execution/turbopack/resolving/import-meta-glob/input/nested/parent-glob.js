// This file lives in `input/nested/` and exercises `import.meta.glob` patterns
// that traverse to the parent directory using `../`. It is imported by the
// top-level `index.js` so that the test assertions live next to the other
// `import.meta.glob` cases.

// Single-level parent traversal (matches ../dir/*.js — i.e. bar.js and foo.js).
export const parentDir = import.meta.glob('../dir/*.js', { eager: true })

// Parent traversal combined with a local pattern in the same call. This is the
// specific shape reported in the issue reproduction.
export const parentAndLocal = import.meta.glob(
  ['./sibling/*.js', '../other/*.js'],
  { eager: true }
)

// Parent traversal with a globstar and named import.
export const parentNamed = import.meta.glob('../dir/*.js', {
  eager: true,
  import: 'default',
})

// Negative pattern applied across parent-relative results.
export const parentWithNegative = import.meta.glob(
  ['../dir/*.js', '!../dir/bar.js'],
  { eager: true }
)
