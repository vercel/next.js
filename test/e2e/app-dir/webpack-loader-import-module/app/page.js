import {
  title,
  items,
  cjsGreeting,
  version,
  esmLabel,
  urlPathname,
  wasmAvailable,
  mjsTitle,
  mjsEsmLabel,
  mjsUrlPathname,
  mjsWasmAvailable,
} from './file.test-file'

export default function Page() {
  return (
    <div>
      <p id="title">{title}</p>
      <p id="items">{items}</p>
      <p id="cjs-greeting">{cjsGreeting}</p>
      <p id="version">{version}</p>
      <p id="esm-label">{esmLabel}</p>
      <p id="url-pathname">{urlPathname}</p>
      <p id="wasm-available">{wasmAvailable}</p>
      <p id="mjs-title">{mjsTitle}</p>
      <p id="mjs-esm-label">{mjsEsmLabel}</p>
      <p id="mjs-url-pathname">{mjsUrlPathname}</p>
      <p id="mjs-wasm-available">{mjsWasmAvailable}</p>
    </div>
  )
}
