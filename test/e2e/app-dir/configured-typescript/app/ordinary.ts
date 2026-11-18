import type { Payload } from './type-only'

enum Offset {
  Base = 3,
}

export function ordinaryValue(input: number): string {
  const payload: Payload = { label: 'ordinary', value: input + Offset.Base }
  return `${payload.label}:${payload.value}`
}
