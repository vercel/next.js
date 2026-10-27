// Keep this first in both import lists so the factory entry needs a distinct namespace.
export const someLongExportName = 'preserved'
export let liveValue = 0
export function increment() {
  liveValue++
}
