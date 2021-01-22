import {
  action,
  actions,
  operations,
  reducerStore,
  selector,
} from '@fleur/fleur'
import { NextJsActions } from '@fleur/next'

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

interface State {
  lastUpdate: number
  light: boolean
  count: number
}

export const TimerStore = reducerStore(
  'Timer',
  (): State => ({
    lastUpdate: 0,
    light: false,
    count: 0,
  })
)
  .listen(NextJsActions.rehydrateServerSideProps, (state, hydrated: State) => {
    // You can handle merging states from getServerSideProps / getStaticProps here!
    // Please .listen(NextJsActions.rehydrateServerSideProps, ...) if you need handle rehydrate
    console.log('Store `Timer` hydrated with: ', hydrated)
    Object.assign(state, hydrated)
  })
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
