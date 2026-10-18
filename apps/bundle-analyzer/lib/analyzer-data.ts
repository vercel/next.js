import useSWR, { type SWRConfiguration } from 'swr'
import { AnalyzeData, ModulesData } from './analyze-data'
import type { RouteSummary } from './diff'
import type { HistoryIndex } from './snapshot'
import { fetchStrict, jsonFetcher } from './utils'

const staticDataOptions = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
}

export function analyzeDataUrl(baseDir: string, route: string): string {
  if (route === '/') return `${baseDir}/analyze.data`
  return `${baseDir}/${route.replace(/^\//, '')}/analyze.data`
}

export function useHistoryIndex() {
  return useSWR<HistoryIndex>('/history/history.json', jsonFetcher, {
    ...staticDataOptions,
    shouldRetryOnError: false,
  })
}

export function useSuspenseJsonData<Data>(
  key: string,
  options: SWRConfiguration<Data> = {}
): Data {
  const { data } = useSWR(key, jsonFetcher<Data>, {
    ...options,
    suspense: true,
  })

  return data
}

/**
 * Per-route summaries written by Turbopack for a build. This is the analyzer's
 * only route index: each `route` names the directory its `analyze.data` was
 * written to.
 */
export function useSuspenseRouteSummaries(baseDir: string): RouteSummary[] {
  return useSuspenseJsonData<RouteSummary[]>(
    `${baseDir}/route-summaries.json`,
    staticDataOptions
  )
}

export function routesFromSummaries(summaries: RouteSummary[]): string[] {
  return summaries.map(({ route }) => route)
}

export async function fetchAnalyzeData(url: string): Promise<AnalyzeData> {
  const response = await fetchStrict(url)
  return new AnalyzeData(await response.arrayBuffer())
}

export async function fetchModulesData(url: string): Promise<ModulesData> {
  const response = await fetchStrict(url)
  return new ModulesData(await response.arrayBuffer())
}
