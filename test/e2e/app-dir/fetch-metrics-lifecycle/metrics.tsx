import { after } from 'next/server'
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'

export async function MetricsPage({ id }: { id: string }) {
  const store = workAsyncStorage.getStore()!
  const trackingDuringRender = store.shouldTrackFetchMetrics
  await fetch(`data:text/plain,render-${id}`, { cache: 'force-cache' })

  after(async () => {
    const trackingAfterClose = store.shouldTrackFetchMetrics
    const urlsBefore = (store.fetchMetrics ?? []).map((metric) => metric.url)
    await fetch(`data:text/plain,after-${id}`, { cache: 'force-cache' })
    const urlsAfter = (store.fetchMetrics ?? []).map((metric) => metric.url)
    console.log(
      'FETCH_METRICS ' +
        JSON.stringify({
          id,
          trackingDuringRender,
          trackingAfterClose,
          urlsBefore,
          urlsAfter,
        })
    )
  })

  return <p>{id}</p>
}
