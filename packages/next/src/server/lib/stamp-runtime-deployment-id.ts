/**
 * Serve-time stamping of the navigation deployment id on prerendered HTML.
 *
 * `experimental.runtimeServerDeploymentId` resolves `NEXT_DEPLOYMENT_ID` at
 * process start for `data-dpl-id` on dynamic renders and for
 * `x-nextjs-deployment-id` on RSC/nav responses. Prerendered HTML still
 * carries the build-time id (the `data-dpl-id` attribute and, when present,
 * the Flight payload `b` field that `setNavigationBuildId` reads). Serving
 * that HTML under a different deployment id makes every client navigation
 * look like a skew mismatch and fall back to an MPA reload forever.
 *
 * Rewrite both sources to the runtime id before sending a cached document.
 */

const DATA_DPL_ID_ATTR = /data-dpl-id="([^"]*)"/
const HTML_OPENING_TAG = /<html/

export function stampRuntimeDeploymentIdOnHtml(
  html: string,
  deploymentId: string
): string {
  if (!deploymentId) return html

  const existing = html.match(DATA_DPL_ID_ATTR)
  const previousId = existing?.[1]
  let stamped = html

  if (existing) {
    stamped = stamped.replace(DATA_DPL_ID_ATTR, `data-dpl-id="${deploymentId}"`)
  } else if (HTML_OPENING_TAG.test(stamped)) {
    stamped = stamped.replace(
      HTML_OPENING_TAG,
      `<html data-dpl-id="${deploymentId}"`
    )
  }

  if (previousId && previousId !== deploymentId) {
    stamped = stampFlightNavigationBuildId(stamped, previousId, deploymentId)
  }

  return stamped
}

export function stampFlightNavigationBuildId(
  payload: string,
  previousId: string,
  deploymentId: string
): string {
  if (!previousId || previousId === deploymentId) return payload
  // Flight inlines the InitialRSCPayload `b` field as a JSON string. The
  // same bytes may appear raw or escaped inside `self.__next_f` script
  // JSON. Do not replace every occurrence of the id — asset URLs also
  // carry `?dpl=`.
  return payload
    .split(`"b":"${previousId}"`)
    .join(`"b":"${deploymentId}"`)
    .split(`\\"b\\":\\"${previousId}\\"`)
    .join(`\\"b\\":\\"${deploymentId}\\"`)
}
