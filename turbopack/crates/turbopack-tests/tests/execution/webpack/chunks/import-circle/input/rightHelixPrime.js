import leftHelixPrime from './leftHelixPrime'

export function run() {
  return import(/* webpackChunkName: "right" */ './rightHelix')
}

export default {
  leftHelixPrime: () => leftHelixPrime,
}
