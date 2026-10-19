import { after } from 'next/server'
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'

export async function fetchAndReport(id: string, cached = false) {
  const store = workAsyncStorage.getStore()!
  const renderUrl = `data:text/plain,${id}-render`
  const afterUrl = `data:text/plain,${id}-after`
  const options = { cache: cached ? 'force-cache' : 'no-store' } as const

  await fetch(renderUrl, options)

  after(async () => {
    await fetch(afterUrl, options)
    // The dev reporter has already printed the metrics. Inspect the retained
    // array to detect metrics appended after response close.
    console.log(
      'FETCH_METRICS ' +
        JSON.stringify({
          id,
          urls: store.fetchMetrics?.map((metric) => metric.url) ?? [],
        })
    )
  })
}
