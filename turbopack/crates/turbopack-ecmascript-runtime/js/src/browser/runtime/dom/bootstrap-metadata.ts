/// <reference path="../base/runtime-base.ts" />

/**
 * Registers the chunk-group bootstrap the server attached to this runtime's
 * own `<script>` tag as a JSON array in `attribute`. This avoids an inline
 * bootstrap script, so no CSP nonce or `'unsafe-inline'` is needed.
 *
 * Must run synchronously while the runtime script executes, since
 * `document.currentScript` is only set then.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function registerBootstrapMetadata(
  attribute: string,
  register: (params: RuntimeParams) => void
) {
  if (typeof document === 'undefined') return

  const value = document.currentScript?.getAttribute(attribute)
  if (value == null) return

  const registrations: RuntimeParams[] = JSON.parse(value)
  registrations.forEach(register)
}
