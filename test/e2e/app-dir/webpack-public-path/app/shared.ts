declare let __webpack_public_path__: string

export function publicPath() {
  return __webpack_public_path__
}

export function publicPathType() {
  return typeof __webpack_public_path__
}

export function setPublicPath(value: string) {
  __webpack_public_path__ = value
}

export function appendPublicPath(value: string) {
  __webpack_public_path__ += value
  // webpack's runtime-API replacement does not preserve shorthand property syntax.
  return { __webpack_public_path__: __webpack_public_path__ }
}

export function shadowPublicPath(__webpack_public_path__: string) {
  __webpack_public_path__ += 'local/'
  return __webpack_public_path__
}
