export function register() {
  // Puts the monotonic clock behind the wall clock, as after the wall clock is
  // stepped forward while the server runs. Date.now() and file mtimes keep the
  // real time.
  const offset = Number(process.env.TIME_ORIGIN_OFFSET_MS)
  if (offset) {
    Object.defineProperty(performance, 'timeOrigin', {
      value: performance.timeOrigin - offset,
    })
  }
}
