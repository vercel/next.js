'use client'

import asset from '../fixtures/client.emit'
import fileAsset from '../fixtures/asset.file'
import mapped from '../fixtures/asset.mapped'
import minify from '../fixtures/asset.minify'

export default function Client() {
  return (
    <>
      <p id="client-asset">{asset}</p>
      <p id="client-file-asset">{fileAsset}</p>
      <p id="client-mapped-value">{mapped}</p>
      <p id="minify-value">{minify}</p>
    </>
  )
}
