const sideEffect = () => {
  globalThis.moduleBundled = true
  return 'value'
}

export const value = /*#__PURE__*/ sideEffect()
