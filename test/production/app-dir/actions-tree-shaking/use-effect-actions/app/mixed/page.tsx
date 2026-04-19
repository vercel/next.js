'use client'

import React, { useEffect } from 'react'
import { action1, action2 } from './actions'
import MyComponent from './my-component'

export default function Page() {
  // to prevent tree-shaking
  if (globalThis.DO_NOT_TREE_SHAKE) {
    console.log('Page imported action2', action2)
  }

  // calling action1 fails!!
  useEffect(() => {
    action1().then((obj) => {
      console.log('action1 returned:', obj)
    })
    if (globalThis.DO_NOT_TREE_SHAKE) {
    }
  }, [])

  return <MyComponent />
}
