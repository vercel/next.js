const sideEffect = (arg) => {
  if (!sideEffect.callArguments) {
    sideEffect.callArguments = []
  }
  sideEffect.callArguments.push(arg)

  return sideEffect.callArguments
}

export default sideEffect
