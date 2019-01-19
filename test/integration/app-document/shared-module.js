let moduleState = 'INITIAL'

export function setState (state) {
  moduleState = state
}

export default function currentState () {
  return moduleState
}
