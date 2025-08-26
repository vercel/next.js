export function loadSub(v: string) {
  return require(`@/sub/${v}`)
}

// TODO not supported
// export function loadSubNested(v: string) {
//   return require(`@/sub-nested/${v}/${v}.js`)
// }

export function loadSubFallback(v: string) {
  return require(`@sub/${v}`)
}
