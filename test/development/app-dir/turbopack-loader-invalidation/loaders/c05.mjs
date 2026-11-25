import { value } from './c05-dep.mjs'

export default function () {
  return `export default ${JSON.stringify(value)}`
}
