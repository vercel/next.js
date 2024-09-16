export function loadSub(v: string) {
  return require(`@/sub/${v}`)
}

export function loadSubNested(v: string) {
  return require(`@/sub-nested/${v}/${v}.js`)
}

export function loadSubFallback(v: string) {
  return require(`@sub/${v}`)
}
