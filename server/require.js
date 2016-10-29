import resolve from './resolve'

export default async function requireModule (path, base) {
  const f = await resolve(path, base)
  return {
    module: require(f.file),
    params: f.params
  }
}
