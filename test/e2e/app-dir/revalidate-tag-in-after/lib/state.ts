type State = { value: number; release?: () => void }
const key = Symbol.for('after-revalidation-repro-state')
const root = globalThis as typeof globalThis & { [key]?: State }
const state = (root[key] ??= { value: 1 })

export const readValue = () => state.value
export const setValue = (value: number) => {
  state.value = value
}
export const prepareRelease = () =>
  new Promise<void>((resolve) => {
    state.release = resolve
  })
export const release = () => {
  state.release?.()
  state.release = undefined
}
