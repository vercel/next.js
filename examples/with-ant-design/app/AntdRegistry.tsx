'use client'

import React from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleProvider, createCache, extractStyle } from '@ant-design/cssinjs'
// if you are using Nextjs 14, use below import instead. More info: https://github.com/ant-design/ant-design/issues/45567
// import { StyleProvider, createCache, extractStyle } from '@ant-design/cssinjs/lib'
import type Entity from '@ant-design/cssinjs/es/Cache'

const StyledComponentsRegistry = ({ children }: React.PropsWithChildren) => {
  const cache = React.useMemo<Entity>(() => createCache(), [])
  useServerInsertedHTML(() => (
    <style
      id="antd"
      dangerouslySetInnerHTML={{ __html: extractStyle(cache, true) }}
    />
  ))
  return <StyleProvider cache={cache}>{children}</StyleProvider>
}

export default StyledComponentsRegistry
