export function Server() {
  return 'This is Server'
}

import { Foo } from './client.js'
// This is unused
export function Client() {
  return <Foo />
}

import { Bar } from './action.js'
// This is unused
export function Action() {
  return <Bar />
}
