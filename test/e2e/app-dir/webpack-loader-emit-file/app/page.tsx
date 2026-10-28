import Client from './client'
import serverAsset from '../fixtures/server.emit'
import pitchAsset from '../fixtures/asset.pitch'
import fileAsset from '../fixtures/asset.file'
import '../fixtures/styles.css'
import { value } from '../fixtures/pure/module.pure'
import { template } from '../fixtures/pure/template.copy'
import { unused as autoValue } from '../fixtures/pure/symbols.auto'
import mapped from '../fixtures/asset.mapped'
import postcssValue from '../fixtures/style.postcss'
import json from '../fixtures/data.emit-json'
import text from '../fixtures/data.emit-text'
import raw from '../fixtures/data.emit-raw'
import bytes from '../fixtures/data.emit-bytes'
import staticAsset from '../fixtures/data.emit-asset'
import { transitiveValue } from '../fixtures/pure/barrel'
import imported from '../fixtures/imported.importer'

export default function Page() {
  return (
    <>
      <p id="server-asset">{serverAsset}</p>
      <p id="pitch-asset">{pitchAsset}</p>
      <p id="file-asset">{fileAsset}</p>
      <p id="pure-value">{value}</p>
      <p id="transitive-value">{transitiveValue}</p>
      <p id="template-value">{template}</p>
      <p id="auto-value">{autoValue}</p>
      <p id="mapped-value">{mapped}</p>
      <p id="postcss-value">{postcssValue}</p>
      <p id="imported-value">{imported}</p>
      <pre id="non-js-values">
        {JSON.stringify({
          json,
          text,
          raw,
          bytes: Array.from(bytes),
          asset: staticAsset,
        })}
      </pre>
      <Client />
    </>
  )
}
