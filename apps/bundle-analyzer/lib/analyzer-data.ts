import useSWR, { type Fetcher, type SWRConfiguration } from 'swr'
import { AnalyzeData, ModulesData } from './analyze-data'
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

export function useSuspenseData<Data>(
  key: string,
  fetcher: Fetcher<Data, string>,
  options: SWRConfiguration<Data> = {}
): Data {
  const { data } = useSWR<Data>(key, fetcher, {
    ...options,
    suspense: true,
  })

  if (data === undefined) {
    throw new Error(`SWR did not resolve data for ${key}`)
  }

  return data
}

export async function fetchAnalyzeData(url: string): Promise<AnalyzeData> {
  const response = await fetchStrict(url)
  return new AnalyzeData(await response.arrayBuffer())
}

export async function fetchModulesData(url: string): Promise<ModulesData> {
  const response = await fetchStrict(url)
  return new ModulesData(await response.arrayBuffer())
}
