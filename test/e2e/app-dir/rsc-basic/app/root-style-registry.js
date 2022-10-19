'use client'

import React from 'react'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'
import { ServerStyleSheet, StyleSheetManager } from 'styled-components'
import { useServerInsertedHTML } from 'next/navigation'
import { useState } from 'react'

export default function RootStyleRegistry({ children }) {
  const [jsxStyleRegistry] = useState(() => createStyleRegistry())
  const [styledComponentsStyleSheet] = useState(() => new ServerStyleSheet())
  const styledJsxFlushEffect = () => {
    const styles = jsxStyleRegistry.styles()
    jsxStyleRegistry.flush()
    return <>{styles}</>
  }
  const styledComponentsFlushEffect = () => {
    const styles = styledComponentsStyleSheet.getStyleElement()
    styledComponentsStyleSheet.seal()

    return <>{styles}</>
  }

  // Allow multiple useServerInsertedHTML
  useServerInsertedHTML(() => {
    return <>{styledJsxFlushEffect()}</>
  })

  useServerInsertedHTML(() => {
    return <>{styledComponentsFlushEffect()}</>
  })

  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
      <StyleRegistry registry={jsxStyleRegistry}>{children}</StyleRegistry>
    </StyleSheetManager>
  )
}
