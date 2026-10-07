export function load(v: string) {
  return require(`@/${v}`)
}

export function loadComplex(dir: string, name: string, ext: string) {
  return require(`@/${dir}/${name}/${ext}`)
}

export function loadSub(v: string) {
  return require(`@/sub/${v}`)
}

export function loadSubNested(v: string) {
  return require(`@/sub-nested/${v}/${v}.js`)
}

export function loadSubFallback(v: string) {
  return require(`@sub/${v}`)
}
