export const text =
  'é中文😀</script><script>globalThis.__flightInjected=1</script>&\u2028\u2029"\\'.repeat(
    200
  ) + '\ud800'
export const expectedText = text.slice(0, -1) + '\ufffd'
export const expectedBytes = '0,255,128,60,195,169'
