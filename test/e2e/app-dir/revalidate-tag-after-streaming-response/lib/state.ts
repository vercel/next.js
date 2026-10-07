type State = { value: number }
const key = Symbol.for('revalidate-tag-after-streaming-response-state')
const root = globalThis as typeof globalThis & { [key]?: State }
const state = (root[key] ??= { value: 1 })

export const readValue = () => state.value
export const setValue = (value: number) => {
  state.value = value
}
