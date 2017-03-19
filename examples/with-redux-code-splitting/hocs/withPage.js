import withRedux from './withRedux'
import { initStore } from '../store'

// Normally you would compose
// multible hocs here
export default withRedux(initStore)
