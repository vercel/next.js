import Fleur, { withReduxDevTools } from '@fleur/fleur'
import { TimerStore } from './timer'

const app = new Fleur({
  stores: [TimerStore],
})

export const createContext = () => {
  return process.env.NODE_ENV === 'development'
    ? withReduxDevTools(app.createContext())
    : app.createContext()
}
