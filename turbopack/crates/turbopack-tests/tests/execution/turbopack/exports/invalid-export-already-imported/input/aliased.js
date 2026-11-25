// `Kitten` is imported under an alias, it's still already imported and must not
// be suggested for `Kittenz`.
import { Kitten as kitten, Kittenz } from './module'

export default [kitten, Kittenz]
