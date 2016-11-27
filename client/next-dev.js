import 'react-hot-loader/patch'
import * as next from './next'
import { requireModule } from '../lib/eval-script'

window.next = next
module.exports = requireModule
