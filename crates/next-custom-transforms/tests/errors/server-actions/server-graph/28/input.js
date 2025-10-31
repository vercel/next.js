'use cache:remote'

export async function foo() {
  return 'data'
}

export async function bar() {
  'use cache : default'
  return 'data'
}

export async function baz() {
  'use cache private'
  return 'data'
}

export async function qux() {
  'use cache '
  return 'data'
}

export async function quux() {
  'use cache: '
  return 'data'
}
