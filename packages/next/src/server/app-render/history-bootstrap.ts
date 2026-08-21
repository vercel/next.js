// React emits this inline script with the shell, before the external bootstrap
// scripts that eventually install the App Router's history handlers (see
// client/components/history-handlers.ts). Until then it records whether
// history changed. It runs in every App Router document, so it has no
// dependencies and stays small.
const historyBootstrapScript = String.raw`
;(function () {
  const earlyHistory = {
    href: location.href,
    changed: false,
  }
  self.__next_h = earlyHistory

  function recordChange() {
    earlyHistory.changed = true
  }

  const originalPushState = history.pushState
  function pushState(data, unused, url) {
    recordChange()
    return originalPushState.call(history, data, unused, url)
  }
  pushState.__original = originalPushState

  const originalReplaceState = history.replaceState
  function replaceState(data, unused, url) {
    recordChange()
    return originalReplaceState.call(history, data, unused, url)
  }
  replaceState.__original = originalReplaceState

  history.pushState = pushState
  history.replaceState = replaceState
  addEventListener('popstate', recordChange)
})()
`

export function prependHistoryBootstrap(
  bootstrapScriptContent: string | undefined
): string {
  return bootstrapScriptContent
    ? `${historyBootstrapScript};${bootstrapScriptContent}`
    : historyBootstrapScript
}
