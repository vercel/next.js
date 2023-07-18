import '../shims'

// Next uses __webpack_require__ extensively.
globalThis.__webpack_require__ = (name) => {
  console.error(
    `__webpack_require__ is not implemented (when requiring ${name})`
  )
}

// initialize() needs `__webpack_public_path__` to be defined.
globalThis.__webpack_public_path__ = undefined
