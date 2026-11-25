'use strict'

import { cache } from 'react'

export const getValue = cache(getValueA)
export const getNamedValue = cache(getNamedValueA)

async function getValueA(arg: string) {
  'use cache: private'
  return `${arg}-${test()}`
}

export async function getNamedValueA(arg: string) {
  'use cache'
  return arg
}

function test() {
  return 'value'
}
