export const allowedDisplayValues = [
  'auto',
  'block',
  'swap',
  'fallback',
  'optional',
] as const

export type Display = (typeof allowedDisplayValues)[number]
