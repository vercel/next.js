import { init } from '@rematch/core'
import { counter, github } from './models'

export const store = init({
  models: {
    counter,
    github
  },
  redux: {
    initialState: {
      counter: 5
    }
  }
})
