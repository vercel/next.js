import MyComponent from '../lib/mycomponent'
import { React } from '../namespace-exported-react'

// Note: Flow syntax doesn't work in routes, except in a very narrow case of pages router on webpack
// without a route segment config.
//
// See https://github.com/vercel/next.js/pull/83919 for a full explanation why. This could be fixed
// if/when edge runtime is deprecated and removed from Next.js.

export default function App() {
  return <MyComponent />
}
