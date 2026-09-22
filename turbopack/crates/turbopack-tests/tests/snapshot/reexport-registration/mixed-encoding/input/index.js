// The first group contains a comma and needs pair encoding. The second is
// comma-free and should still use compact encoding in the same registration.
export { 'has,comma', b } from './first'
export { c } from './second'
