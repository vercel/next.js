import { exec } from './util.js'

export function unused() {
  return exec
}

export function used() {
  return 'used'
}
