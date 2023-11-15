'use client'

import React from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleProvider, createCache, extractStyle } from '@ant-design/cssinjs'
import type Entity from '@ant-design/cssinjs/es/Cache'

/**
 * @descCN 注意：当你安装 `@ant-design/cssinjs` 时，必须确保版本号跟 `antd` 的 `node_modules` 中的 `@ant-design/cssinjs` 版本保持一致，否则会出现多个 React 实例，导致无法正确的读取 ctx。
 * @descEN Notes: when you install `@ant-design/cssinjs`, you must ensure that the version is consistent with the version of `@ant-design/cssinjs` in `node_modules` of `antd`, otherwise, multiple React instances will appear, resulting in ctx being unable to be read correctly.
 */
const StyledComponentsRegistry = ({ children }: React.PropsWithChildren) => {
  const cache = React.useMemo<Entity>(() => createCache(), [])
  const isServerInserted = React.useRef<boolean>(false);
  useServerInsertedHTML(() => {
    // avoid duplicate css insert
    if (isServerInserted.current) {
      return;
    }
    isServerInserted.current = true;
    return <style id="antd" dangerouslySetInnerHTML={{ __html: extractStyle(cache, true) }} />;
  });
  return <StyleProvider cache={cache}>{children}</StyleProvider>
}

export default StyledComponentsRegistry
