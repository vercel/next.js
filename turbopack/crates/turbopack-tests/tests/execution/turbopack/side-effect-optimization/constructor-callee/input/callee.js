function getConstructor() {
  globalThis.constructorCallee = 'evaluated'
  return class {}
}

/*#__PURE__*/ new (getConstructor())()
