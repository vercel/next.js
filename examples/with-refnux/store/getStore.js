import { createStore } from 'refnux'

const storeInitialState = { counter: 0, key: 'value' }

const getStore = () => {
  let store = null
  if (typeof window === 'undefined') {
    store = createStore(storeInitialState)
  } else {
    store = window.store || createStore(storeInitialState)
    window.store = store
  }
  return store
}

export default getStore
