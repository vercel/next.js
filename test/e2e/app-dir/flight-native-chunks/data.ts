// Long enough that React outlines it as a Flight text row and writes it as a
// raw string. The trailing lone surrogate cannot be encoded as UTF-8.
export const text =
  'é中文😀</script><script>globalThis.__flightInjected=1</script>&\u2028\u2029"\\'.repeat(
    200
  ) + '\ud800'
// Every consumer sees the lone surrogate as U+FFFD, which is what UTF-8
// encoding produces for it on the RSC response and in the inline script.
export const expectedText = text.slice(0, -1) + '\ufffd'
export const expectedBytes = '0,255,128,60,195,169'
