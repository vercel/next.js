import { sharedValue } from './shared'

export function heavyValue(value: string) {
  return sharedValue(`${value}/heavy`)
}

export async function nestedHeavyValue(value: string) {
  const { deepValue } = await import('./deep')
  return deepValue(`${value}/heavy`)
}
