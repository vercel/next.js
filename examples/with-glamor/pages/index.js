import React from 'react'
import { style, rehydrate } from 'glamor'

// Adds server generated styles to glamor cache.
// Has to run before any `style()` calls
// '__NEXT_DATA__.ids' is set in '_document.js'
if (typeof window !== 'undefined') {
  rehydrate(window.__NEXT_DATA__.ids)
}

export default () => <h1 {...styles.title}>My page</h1>

const styles = {
  title: style({
    color: 'red',
    fontSize: 50
  })
}
