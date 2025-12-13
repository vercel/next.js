export default new URL('file.png?default', import.meta.url)
export const named = new URL('file.png?named', import.meta.url)
export const indirect = fn
export const used = new URL('file.png?used', import.meta.url)

function fn() {
  return new URL('file.png?indirect', import.meta.url)
}
