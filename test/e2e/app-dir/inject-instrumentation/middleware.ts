import { probe } from './app/probe'

// `middleware.ts` runs in the Edge runtime. An Edge route handler would not
// build with Cache Components.
export function middleware() {
  return probe()
}

export const config = { matcher: '/edge' }
