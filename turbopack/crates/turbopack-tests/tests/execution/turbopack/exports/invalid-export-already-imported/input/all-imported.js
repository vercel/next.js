// Every export of the module is already imported, so nothing is suggested for
// `Nope`.
import { Kitten, Kit, Mitten, Nope } from './module'

export default [Kitten, Kit, Mitten, Nope]
