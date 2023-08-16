import { Marker } from './components/marker'

export function useMDXComponents(components) {
  return {
    ...components,
    Marker,
  }
}
