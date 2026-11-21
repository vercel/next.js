let state = 0

export const annotated = /*#__NO_SIDE_EFFECTS__*/ function () {
  state++
}

const exportedLater = /*@__NO_SIDE_EFFECTS__*/ function () {
  state++
}
export { exportedLater }

export default /*#__NO_SIDE_EFFECTS__*/ function () {
  state++
}

export /*#__NO_SIDE_EFFECTS__*/ function annotatedDeclaration() {
  state++
}

export function unannotated() {
  state++
}

export const factory = /*#__NO_SIDE_EFFECTS__*/ function (
  eventsOrStrings,
  events = eventsOrStrings
) {
  function effect() {
    events.push('called')
  }
  effect.authorize = function () {
    if (this !== effect) throw new Error('lost receiver')
    throw new Error('denied')
  }
  return effect
}

export function getState() {
  return state
}
