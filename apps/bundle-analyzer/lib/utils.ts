import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { SpecialModule } from './types'
import { NetworkError } from './errors'
import { AnalyzeData, SourceIndex } from './analyze-data'

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
  sourceIndex: SourceIndex | null
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

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

let IDENT_ATTRIBUTES_REGEXP =
  /^(.+?)(?: \{(.*)\})?(?: \[(.*)\])?(?: \((.*?)\))?(?: <(.*?)>)?$/

export function splitIdent(ident: string): {
  fullPath: string
  templateArgs: string
  layer: string
  moduleType: string
  treeShaking: string
} {
  let [match, fullPath, templateArgs, layer, moduleType, treeShaking] =
    IDENT_ATTRIBUTES_REGEXP.exec(ident) || ['']
  ident = ident.substring(0, ident.length - match.length)
  return { fullPath, templateArgs, layer, moduleType, treeShaking }
}
