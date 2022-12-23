'use client'

import { useState, type PropsWithChildren } from 'react'
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs'
import { useServerInsertedHTML } from 'next/navigation'

export const RootStyleRegistry = ({ children }: PropsWithChildren) => {
  const [cache] = useState(() => createCache())

  useServerInsertedHTML(() => {
    return <style dangerouslySetInnerHTML={{ __html: extractStyle(cache) }} />
  })

  return <StyleProvider cache={cache}>{children}</StyleProvider>
}
