import useSWR, { type SWRConfiguration } from 'swr'
import { AnalyzeData, ModulesData } from './analyze-data'
import type { HistoryIndex } from './snapshot'
import { fetchStrict, jsonFetcher } from './utils'

export function analyzeDataUrl(baseDir: string, route: string): string {
  if (route === '/') return `${baseDir}/analyze.data`
  return `${baseDir}/${route.replace(/^\//, '')}/analyze.data`
}

// Snapshot paths keep large data cacheable without reusing a previous live build.
export function currentDataDir(history: HistoryIndex | undefined): string {
  const latest = history?.snapshots[0]
  return latest ? `/history/${latest.id}` : '/data'
}

async function fetchHistoryIndex(url: string): Promise<HistoryIndex> {
  // The index is mutable; revalidate it even when the browser considers it fresh.
  const response = await fetchStrict(url, { cache: 'no-cache' })
  return response.json() as Promise<HistoryIndex>
}

export function useHistoryIndex() {
  return useSWR<HistoryIndex>('/history/history.json', fetchHistoryIndex, {
    revalidateOnFocus: true,
    revalidateOnReconnect: false,
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

export async function fetchAnalyzeData(url: string): Promise<AnalyzeData> {
  const response = await fetchStrict(url)
  return new AnalyzeData(await response.arrayBuffer())
}

export async function fetchModulesData(url: string): Promise<ModulesData> {
  const response = await fetchStrict(url)
  return new ModulesData(await response.arrayBuffer())
}
