import { reExportedValue as leafValue } from './leaf'

export const reExportedValue = `${leafValue}:${globalThis.navigator?.platform ?? 'unknown'}`
