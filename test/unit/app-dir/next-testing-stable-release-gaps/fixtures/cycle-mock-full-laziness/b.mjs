import { name } from './a.mjs'
throw new Error('fully mocked cyclic original was evaluated')
// eslint-disable-next-line no-unreachable -- Evaluating this supposedly lazy original must throw before its exports are observed.
export const value = 1
export const readName = () => name
