export function state(route, params = {}, locale = null) {
  return { route, params, locale, generation: crypto.randomUUID() }
}
export function State({ value }) {
  return <pre id="route-state">{JSON.stringify(value)}</pre>
}
