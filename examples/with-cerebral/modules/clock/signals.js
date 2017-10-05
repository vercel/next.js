import {set} from 'cerebral/operators'
import {state, props} from 'cerebral/tags'
import {startTimer, stopTimer} from './actions'

export const mounted = [
  startTimer,
  set(state`clock.light`, true)
]
export const unMounted = stopTimer
export const secondTicked = set(state`clock.lastUpdate`, props`now`)
