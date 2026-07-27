import { baz } from '../actions'

// Ensure side effects won't affect tree shaking and DCE
console.log(1)

export { baz }
