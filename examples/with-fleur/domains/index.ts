import Fleur, { withReduxDevTools } from '@fleur/fleur'
import { withSSPDistributer } from '@fleur/next'
import { TimerStore } from './timer'

const app = new Fleur({
  stores: [TimerStore],
})

export const createContext = () => {
  const context = withSSPDistributer(app.createContext())

  return process.env.NODE_ENV === 'development'
    ? withReduxDevTools(context)
    : context
}
