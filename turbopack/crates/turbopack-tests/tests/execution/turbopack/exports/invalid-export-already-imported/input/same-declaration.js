// `Kitten` is the closest match for `Kittens`, but it's already imported by
// this declaration, so it must not be suggested.
import { Kitten, Kittens } from './module'

export default [Kitten, Kittens]
