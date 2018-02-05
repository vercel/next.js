import resolve from './resolve'

export default async function requireModule (path) {
  const f = await resolve(path)
  return require(f)
}
