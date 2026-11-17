import Client from './client'
import serverAsset from '../fixtures/server.emit'
import pitchAsset from '../fixtures/asset.pitch'
import '../fixtures/styles.css'
import { value } from '../fixtures/pure/module.pure'
import mapped from '../fixtures/asset.mapped'
import json from '../fixtures/data.emit-json'
import staticAsset from '../fixtures/data.emit-asset'
import { transitiveValue } from '../fixtures/pure/barrel'
import imported from '../fixtures/imported.importer'

export default function Page() {
  return (
    <>
      <p id="server-asset">{serverAsset}</p>
      <p id="pitch-asset">{pitchAsset}</p>
      <p id="pure-value">{value}</p>
      <p id="transitive-value">{transitiveValue}</p>
      <p id="mapped-value">{mapped}</p>
      <p id="imported-value">{imported}</p>
      <pre id="non-js-values">
        {JSON.stringify({
          json,
          asset: staticAsset,
        })}
      </pre>
      <Client />
    </>
  )
}
