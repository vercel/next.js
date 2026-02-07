import { title, items, cjsGreeting, version, esmLabel } from './file.test-file'

export default function Page() {
  return (
    <div>
      <p id="title">{title}</p>
      <p id="items">{items}</p>
      <p id="cjs-greeting">{cjsGreeting}</p>
      <p id="version">{version}</p>
      <p id="esm-label">{esmLabel}</p>
    </div>
  )
}
