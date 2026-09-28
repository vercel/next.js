'use client'

// @ts-expect-error -- resolved from the browser's federated share scope
import { value } from 'shared-value'

// Only load this module in the browser: server and Edge share consumption is unsupported.
export default function StaticSharedValue() {
  return <p id="static-shared-value">{value}</p>
}
