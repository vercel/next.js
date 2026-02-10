import {
  title,
  items,
  cjsGreeting,
  version,
  esmLabel,
  imageUrl,
  wasmAddResult,
  dynamicValue,
  mjsTitle,
  mjsEsmLabel,
  mjsImageUrl,
  mjsWasmAddResult,
  mjsDynamicValue,
  aliasValue,
  aliasDepLabel,
  customDataValue,
  consumedValue,
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
      <p id="dynamic-value">{dynamicValue}</p>
      <p id="mjs-title">{mjsTitle}</p>
      <p id="mjs-esm-label">{mjsEsmLabel}</p>
      <p id="mjs-image-url">{mjsImageUrl}</p>
      <p id="mjs-wasm-add-result">{mjsWasmAddResult}</p>
      <p id="mjs-dynamic-value">{mjsDynamicValue}</p>
      <p id="alias-value">{aliasValue}</p>
      <p id="alias-dep-label">{aliasDepLabel}</p>
      <p id="custom-data-value">{customDataValue}</p>
      <p id="consumed-value">{consumedValue}</p>
    </div>
  )
}
