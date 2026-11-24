// Same shape as `reordered-sources`, where code unit order puts `second`'s key before `first`'s.
// Here every export is imported by name, so the names are mangled and the namespace object never
// escapes. Its key order is unobservable, so the registration keeps import order and subsumes the
// imports.
export { y, z } from './first'
export { a } from './second'
