// Directive-shaped strings used as values (not as statements) are ordinary
// data and must not be reported as misplaced directives.
const directive = 'use client'

export function foo() {
  return 'use client'
}

export const arrow = () => 'use server'

export async function bar() {
  console.log('use server')
  const kind = 'use cache'
  return kind
}

export async function baz() {
  if (true) {
    console.log('use client')
  }
  return 'use cache: remote'
}
