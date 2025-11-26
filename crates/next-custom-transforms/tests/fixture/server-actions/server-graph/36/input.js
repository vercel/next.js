'use cache'

export async function foo() {
  return 'data A'
}

export async function bar() {
  return 'data B'
}

export default async function Cached({ children }) {
  return children
}

export const baz = async function () {
  return 'data C'
}
