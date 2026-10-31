'use client'

import { ERROR_MARKER } from './error-marker'

export default function ErrorBoundary() {
  return <p id="error">{ERROR_MARKER}</p>
}
