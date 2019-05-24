import { init } from '@rematch/core'
import { counter, github } from './models'

const exampleInitialState = {
  counter: 5
}

export const initializeStore = (initialState = exampleInitialState) => init({
  models: {
    counter,
    github
  },
  redux: {
    initialState
  }
})
