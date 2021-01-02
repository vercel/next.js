import {
  action,
  actions,
  operations,
  reducerStore,
  selector,
} from '@fleur/fleur'

export const TimerActions = actions('Timer', {
  tick: action<{ light: boolean; lastUpdate: number }>(),
  increment: action(),
  decrement: action(),
  reset: action(),
})

export const TimerOps = operations({
  tick: async (context, payload: { light: boolean; lastUpdate: number }) => {
    context.dispatch(TimerActions.tick, payload)
  },
  increment: async (context) => {
    context.dispatch(TimerActions.increment, {})
  },
  decrement: async (context) => {
    context.dispatch(TimerActions.decrement, {})
  },
  reset: async (context) => {
    context.dispatch(TimerActions.reset, {})
  },
})

export const TimerStore = reducerStore('Timer', () => ({
  lastUpdate: 0,
  light: false,
  count: 0,
}))
  .listen(TimerActions.tick, (state, { light, lastUpdate }) => {
    state.lastUpdate = lastUpdate
    state.light = !!light
  })
  .listen(TimerActions.increment, (state) => {
    state.count++
  })
  .listen(TimerActions.decrement, (state) => {
    state.count--
  })
  .listen(TimerActions.reset, (state) => {
    state.count = 0
  })

export const TimerSelector = {
  getCount: selector((getState) => getState(TimerStore).count),
}
