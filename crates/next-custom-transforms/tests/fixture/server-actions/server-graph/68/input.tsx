'use cache'

// @ts-ignore
import { foo, bar } from './foo'

type Foo = {}
type Bar = {}

export { foo, Foo }
export { bar, type Bar }
