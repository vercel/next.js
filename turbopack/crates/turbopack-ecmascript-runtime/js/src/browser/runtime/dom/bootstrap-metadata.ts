/// <reference path="../base/runtime-base.ts" />

/**
 * Registers the chunk-group bootstrap the host attached to this runtime's own
 * `<script>` tag as a JSON array in its `data-turbopack-bootstrap` attribute.
 * This avoids an inline bootstrap script, so no CSP nonce or `'unsafe-inline'`
 * is needed. Does nothing when the attribute is absent.
 *
 * Must run synchronously while the runtime script executes, since
 * `document.currentScript` is only set then.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function registerBootstrapFromScript(
  register: (params: RuntimeParams) => void
) {
  if (typeof document === 'undefined') return

  const value = document.currentScript?.dataset.turbopackBootstrap
  if (value === undefined) return

  const registrations: RuntimeParams[] = JSON.parse(value)
  registrations.forEach(register)
}
