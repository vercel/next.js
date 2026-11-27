export function readCurrentTime() {
  return new Date().toISOString()
}

// Like a carousel library's React wrapper that creates its instance during render.
export function BlockingWidget() {
  return readCurrentTime()
}
