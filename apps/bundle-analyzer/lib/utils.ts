import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { SpecialModule } from './types'
import { NetworkError } from './errors'
import { AnalyzeData } from './analyze-data'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function fetchStrict(url: string): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    throw new NetworkError(`Failed to fetch ${url}`, { cause: err })
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  return res
}

export async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetchStrict(url)
  return res.json() as Promise<T>
}

export function getSpecialModuleType(
  analyzeData: AnalyzeData | undefined,
  sourceIndex: number | null
): SpecialModule | null {
  if (!analyzeData || sourceIndex == null) return null

  const path = analyzeData.source(sourceIndex)?.path || ''
  if (path.endsWith('polyfill-module.js')) {
    return SpecialModule.POLYFILL_MODULE
  } else if (path.endsWith('polyfill-nomodule.js')) {
    return SpecialModule.POLYFILL_NOMODULE
  }

  return null
}
