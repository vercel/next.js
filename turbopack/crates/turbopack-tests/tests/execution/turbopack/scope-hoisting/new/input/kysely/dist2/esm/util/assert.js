/// <reference types="./assert.d.ts" />
export function assertNotNullOrUndefined(value) {
  if (value === null || value === undefined) {
    throw new Error(`${value} must not be null or undefined`)
  }
}
export function assertIsString(value) {
  if (typeof value !== 'string') {
    throw new Error(`${value} must be a string`)
  }
}
