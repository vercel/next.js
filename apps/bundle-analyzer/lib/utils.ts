import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { SpecialModule } from './types'
import { AnalyzeData } from './analyze-data'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function jsonFetcher<T>(url: string): Promise<T> {
  return fetch(url).then((res) => res.json())
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
