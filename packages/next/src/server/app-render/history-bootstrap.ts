// React emits this inline script with the shell, before the external bootstrap
// scripts that eventually install the App Router's history handlers (see
// client/components/history-handlers.ts). Until then it marks the entry the
// document was activated on and records whether history changed. It runs in
// every App Router document, so it has no dependencies and stays small.
const historyBootstrapScript = String.raw`
;(function () {
  const marker = '__PRIVATE_NEXTJS_INTERNALS_HISTORY_ACTIVATION'
  const earlyHistory = {
    href: location.href,
    changed: false,
  }
  self.__next_h = earlyHistory

  function recordChange() {
    earlyHistory.changed = true
  }

  // An entry written from the activation entry renders the same page, so it
  // inherits the mark. Like copyNextJsInternalHistoryState in
  // history-handlers.ts, absent state becomes an object to carry it. The
  // router's own writes carry their state already; the first one happens
  // before the wrappers are removed.
  function inheritActivation(data) {
    if (data && data.__NA === true) {
      return data
    }
    if (data == null) {
      data = {}
    }
    const current = history.state
    if (current && current[marker] === true) {
      data[marker] = true
    }
    return data
  }

  const originalPushState = history.pushState
  function pushState(data, unused, url) {
    recordChange()
    data = inheritActivation(data)
    return originalPushState.call(history, data, unused, url)
  }
  pushState.__original = originalPushState

  const originalReplaceState = history.replaceState
  function replaceState(data, unused, url) {
    recordChange()
    data = inheritActivation(data)
    return originalReplaceState.call(history, data, unused, url)
  }
  replaceState.__original = originalReplaceState

  // The entry may still carry the router state of the document that created
  // it. The new document's payload supersedes that, so the entry is marked as
  // this document's activation entry instead.
  const activationState = Object.assign({}, history.state)
  delete activationState.__NA
  delete activationState.__PRIVATE_NEXTJS_INTERNALS_TREE
  activationState[marker] = true
  originalReplaceState.call(history, activationState, '', location.href)

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
