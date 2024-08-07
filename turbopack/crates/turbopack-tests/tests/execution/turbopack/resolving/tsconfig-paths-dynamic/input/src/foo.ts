export function loadSub(v: string) {
  return require(`@/sub/${v}`)
}

export function loadSub2(v: string) {
  return require(`@/sub2/${v}/${v}.js`)
}
