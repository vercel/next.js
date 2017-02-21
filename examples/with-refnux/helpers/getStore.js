import { createStore } from 'refnux'

let storeMemoized = null

const getStore = (initialState) => {
  let store = null
  if (typeof window == 'undefined') {
    store = createStore(initialState)
  } else {
    if (!storeMemoized) {
      storeMemoized = createStore(initialState)
    }
    store = storeMemoized
  }
  return store
}

export default getStore