import { helper } from './dep.js'

export function Component({ value }) {
  return <p>{helper(value)}</p>
}
