import resolve from './resolve'

export default async function requireModule (path, base) {
  const resolved = await resolve(path, base)
  return {
    module: require(resolved.file),
    params: resolved.params
  }
}
