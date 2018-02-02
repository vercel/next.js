
import {mounted, unMounted, secondTicked} from './signals'
import provider from './provider'

export default {
  state: {
    lastUpdate: 0,
    light: false
  },
  signals: {
    mounted,
    unMounted,
    secondTicked
  },
  provider
}
