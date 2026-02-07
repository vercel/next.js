import {
  title,
  items,
  cjsGreeting,
  version,
  esmLabel,
  imageUrl,
  wasmAddResult,
  mjsTitle,
  mjsEsmLabel,
  mjsImageUrl,
  mjsWasmAddResult,
} from './file.test-file'

export default function Page() {
  return (
    <div>
      <p id="title">{title}</p>
      <p id="items">{items}</p>
      <p id="cjs-greeting">{cjsGreeting}</p>
      <p id="version">{version}</p>
      <p id="esm-label">{esmLabel}</p>
      <p id="image-url">{imageUrl}</p>
      <p id="wasm-add-result">{wasmAddResult}</p>
      <p id="mjs-title">{mjsTitle}</p>
      <p id="mjs-esm-label">{mjsEsmLabel}</p>
      <p id="mjs-image-url">{mjsImageUrl}</p>
      <p id="mjs-wasm-add-result">{mjsWasmAddResult}</p>
    </div>
  )
}
