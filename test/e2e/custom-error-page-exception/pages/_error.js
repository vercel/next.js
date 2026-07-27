let renderCount = 0

export default function Error() {
  renderCount++

  // Guard to avoid endless loop crashing the browser tab.
  if (typeof window !== 'undefined' && renderCount < 3) {
    throw new Error('crash')
  }
  return `error threw ${renderCount} times`
}
