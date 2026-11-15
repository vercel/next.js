'use cache'

import { lang } from 'next/root-params'

export async function foo() {
  return 'foo'
}

export async function bar() {
  return lang()
}
