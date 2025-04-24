import type { CollectedMetadata } from '../metadata/types'
import type { ValueOf } from '../../../../shared/lib/constants'

// TODO-APP: check if this can be narrowed.
type ModuleGetter = () => any

export type ModuleTuple = [getModule: ModuleGetter, filePath: string]

const HTTP_ACCESS_FALLBACKS = {
  'not-found': 'not-found',
  forbidden: 'forbidden',
  unauthorized: 'unauthorized',
} as const

export const FILE_TYPES = {
  layout: 'layout',
  template: 'template',
  error: 'error',
  loading: 'loading',
  'global-error': 'global-error',
  ...HTTP_ACCESS_FALLBACKS,
} as const

export type AppDirModules = {
  readonly [moduleKey in ValueOf<typeof FILE_TYPES>]?: ModuleTuple
} & {
  readonly page?: ModuleTuple
} & {
  readonly metadata?: CollectedMetadata
} & {
  readonly defaultPage?: ModuleTuple
}
