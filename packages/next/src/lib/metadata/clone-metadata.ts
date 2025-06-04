import type {
  ResolvedMetadata,
  ResolvedViewport,
} from './types/metadata-interface'

const TYPE_URL = '__METADATA_URL'

function replacer(_key: string, val: any) {
  // clone URL as string but recover it as URL
  if (val instanceof URL) {
    return { _type: TYPE_URL, value: val.href }
  }
  return val
}

function reviver(_key: string, val: any) {
  if (typeof val === 'object' && val !== null && val._type === TYPE_URL) {
    return new URL(val.value)
  }
  return val
}

export function cloneMetadata<T extends ResolvedMetadata | ResolvedViewport>(
  metadata: T
): T {
  const jsonString = JSON.stringify(metadata, replacer)
  return JSON.parse(jsonString, reviver)
}
