declare global {
  interface Window {
    __NEXT_HMR_LATENCY_CB: ((latencyMs: number) => void) | undefined
  }
}

export default function reportHmrLatency(
  sendMessage: (message: string) => void,
  updatedModules: ReadonlyArray<string>,
  startMsSinceEpoch: number,
  endMsSinceEpoch: number
) {
  const latencyMs = endMsSinceEpoch - startMsSinceEpoch
  console.log(`[Fast Refresh] done in ${latencyMs}ms`)
  sendMessage(
    JSON.stringify({
      event: 'client-hmr-latency',
      id: window.__nextDevClientId,
      startTime: startMsSinceEpoch,
      endTime: endMsSinceEpoch,
      page: window.location.pathname,
      updatedModules,
      // Whether the page (tab) was hidden at the time the event occurred.
      // This can impact the accuracy of the event's timing.
      isPageHidden: document.visibilityState === 'hidden',
    })
  )
  if (self.__NEXT_HMR_LATENCY_CB) {
    self.__NEXT_HMR_LATENCY_CB(latencyMs)
  }
}
