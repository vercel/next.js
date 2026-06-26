import { getButtonMessage } from 'button-pkg'

// `button-pkg` is an ESM package externalized via `serverExternalPackages`.
// Turbopack loads it at runtime via `import()`. Node's ESM resolver then walks
// `button-pkg` -> `i18n-pkg` and fails on the CJS re-export, so this throws.
export const dynamic = 'force-dynamic'

export default function Page() {
  return <p id="message">{getButtonMessage()}</p>
}
