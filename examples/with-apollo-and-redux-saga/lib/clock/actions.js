export const actionTypes = {
  START_CLOCK: 'START_CLOCK',
  TICK_CLOCK: 'TICK_CLOCK',
}

export function startClock(isServer = true) {
  return {
    type: actionTypes.START_CLOCK,
    light: isServer,
    lastUpdate: null,
  }
}

export function tickClock(isServer) {
  return {
    type: actionTypes.TICK_CLOCK,
    light: !isServer,
    lastUpdate: Date.now(),
  }
}
