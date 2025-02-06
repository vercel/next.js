/**
 * "Utility for constructing className strings conditionally."
 * @reference https://github.com/lukeed/clsx/blob/925494cf31bcd97d3337aacd34e659e80cae7fe2/src/lite.js
 */
export function clsx(...args: (string | undefined | null | false)[]): string {
  var i = 0,
    tmp,
    str = '',
    len = args.length
  for (; i < len; i++) {
    if ((tmp = args[i])) {
      if (typeof tmp === 'string') {
        str += (str && ' ') + tmp
      }
    }
  }
  return str
}
