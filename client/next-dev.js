import 'react-hot-loader/patch'
import './webpack-dev-client?http://localhost:3030'
import * as next from './next'

window.next = next
module.exports = require('./require')
