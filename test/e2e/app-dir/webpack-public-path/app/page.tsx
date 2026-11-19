'use client'

import { useState, type ComponentType } from 'react'
import Link from 'next/link'
import {
  appendPublicPath,
  publicPath,
  publicPathType,
  setPublicPath,
  shadowPublicPath,
} from './shared'

export default function Page() {
  const [result, setResult] = useState('waiting')
  const [count, setCount] = useState(0)
  const [asset, setAsset] = useState('')
  const [image, setImage] = useState('')
  const [workerPublicPath, setWorkerPublicPath] = useState('')
  const [Styled, setStyled] = useState<ComponentType | null>(null)
  return (
    <>
      <button
        id="change-public-path"
        onClick={async () => {
          const original = publicPath()
          setPublicPath('/webpack-public-path-first/')
          const first = await import('./first')
          setPublicPath('/webpack-public-path-')
          const shorthand = appendPublicPath('second/')
          const second = await import('./second')
          setResult(
            JSON.stringify({
              original,
              first: first.default,
              second: second.default,
              current: publicPath(),
              shorthand,
              shadowed: shadowPublicPath('local-'),
              type: publicPathType(),
            })
          )
        }}
      >
        Change public path
      </button>
      <button
        id="switch-pending-public-path"
        onClick={() => setPublicPath('/webpack-public-path-second/')}
      >
        Switch while a chunk is loading
      </button>
      <button
        id="reset-public-path"
        onClick={() => {
          setPublicPath('/_next/')
          setResult(publicPath())
        }}
      >
        Reset public path
      </button>
      <button id="counter" onClick={() => setCount(count + 1)}>
        {count}
      </button>
      <button
        id="load-styled"
        onClick={async () => {
          const { default: Component } = await import('./styled')
          setStyled(() => Component)
        }}
      >
        Load styles
      </button>
      <button
        id="load-asset"
        onClick={async () => {
          const { assetUrl } = await import('./asset-url')
          setAsset(assetUrl)
        }}
      >
        Load asset
      </button>
      <p id="asset-url">{asset}</p>
      <button
        id="load-image"
        onClick={async () => {
          const { imageSrc } = await import('./image-src')
          setImage(imageSrc)
        }}
      >
        Load image
      </button>
      <p id="image-src">{image}</p>
      <button
        id="load-worker"
        onClick={() => {
          const worker = new Worker(
            new URL('./public-path-worker.ts', import.meta.url)
          )
          worker.onmessage = (event) => setWorkerPublicPath(event.data)
        }}
      >
        Load worker
      </button>
      <p id="worker-public-path">{workerPublicPath}</p>
      {Styled && <Styled />}
      <pre id="public-path-result">{result}</pre>
      <Link href="/destination" prefetch={false} id="navigate">
        Navigate
      </Link>
    </>
  )
}
