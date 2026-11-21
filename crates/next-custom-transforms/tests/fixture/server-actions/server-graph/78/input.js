// Inline server action and cache functions nested inside blocks are valid:
// the directive is at the top of their own function body.
export function outer() {
  if (true) {
    async function action() {
      'use server'
    }
    return action
  }
}

export function withCache() {
  const cached = async () => {
    'use cache'
    return 1
  }
  return cached
}
