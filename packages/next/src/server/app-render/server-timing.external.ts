import { serverTimingAsyncStorage } from './server-timing-instance' with { 'turbopack-transition': 'next-shared' }

export type Metrics = Map<string, { dur?: number; desc?: string }>
export { serverTimingAsyncStorage }
