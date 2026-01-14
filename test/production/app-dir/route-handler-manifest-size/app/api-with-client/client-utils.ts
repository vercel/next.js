'use client'

// A client utility module directly imported by a route handler
export function formatData(data: { value: number }) {
  return `Formatted: ${data.value}`
}
