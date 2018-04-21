import { init } from '@rematch/core'
import { counter, github } from './models'

// rematch store with initialValue set to 5
export const initStore = (initialState = { counter: 5 }) => {
  return init({
    models: {
      counter,
      github
    },
    redux: {
      initialState
    }
  })
}
