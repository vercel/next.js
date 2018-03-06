export const actionTypes = {
  COUNT_INCREASE: 'COUNT_INCREASE',
  COUNT_DECREASE: 'COUNT_DECREASE'
}

export function countIncrease() {
  return { type: actionTypes.COUNT_INCREASE }
}

export function countDecrease() {
  return { type: actionTypes.COUNT_DECREASE }
}
