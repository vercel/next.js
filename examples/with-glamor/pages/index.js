import React from 'react'
import { rehydrate } from 'glamor'

// Adds server generated styles to glamor cache.
// Has to run before any `style()` calls
// '__NEXT_DATA__.ids' is set in '_document.js'
if (typeof window !== 'undefined') {
  rehydrate(window.__NEXT_DATA__.ids)
}

export default () => <h1 css={{ color: 'red', fontSize: 50 }}>My page</h1>
