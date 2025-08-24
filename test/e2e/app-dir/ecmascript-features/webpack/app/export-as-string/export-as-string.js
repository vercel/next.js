// `.js` file as TypeScript does not support re-exporting with a string literal.
// Details: https://github.com/microsoft/TypeScript/issues/40594

let x = 1

export { x as 'abc' }
