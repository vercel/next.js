import 'react-hot-loader/patch'
import './webpack-dev-client?http://localhost:3030'
import * as next from './next'

module.exports = next

window.next = next
