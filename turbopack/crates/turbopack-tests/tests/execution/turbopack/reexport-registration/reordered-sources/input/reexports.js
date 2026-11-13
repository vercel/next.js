// Every source contributes one group, but in code unit order `second`'s key comes before
// `first`'s, so the groups are not in import order and the imports must not be subsumed.
export { y, z } from './first'
export { a } from './second'
