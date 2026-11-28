const state = []
const initialization = state.push('ready')

export function readState() {
  return state[0]
}

export function readUnusedInitialization() {
  return initialization + 'UNUSED_SIDE_EFFECT_FREE_INITIALIZATION'
}
