// Same as leading-only.js plus one trailing comment.

/* istanbul ignore next */
export function withTrailing() {
  return 'with-trailing'
}

export const unrelated = 1 // one trailing comment
