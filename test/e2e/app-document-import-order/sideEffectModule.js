const sideEffect = (arg) => {
  if (!sideEffect.callArguments) {
    sideEffect.callArguments = []
  }
  sideEffect.callArguments.push(arg)

  return sideEffect.callArguments
}

globalThis.__appPageSharedModuleMarker = 'APP_PAGE_SHARED_MODULE_MARKER'

export default sideEffect
