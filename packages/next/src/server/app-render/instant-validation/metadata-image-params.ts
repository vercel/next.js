import type { Params } from '../../request/params'
import { workUnitAsyncStorage } from '../work-unit-async-storage.external'

const PARAM_PLACEHOLDER = '-'

export function adaptParamsForImageMetadata(params: Params) {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'request': {
        if (workUnitStore.validationSamples) {
          const { isExhaustiveParamsProxy } =
            require('./instant-samples') as typeof import('./instant-samples')
          if (isExhaustiveParamsProxy(params)) {
            return createPlaceholderParamsForInstantValidation(
              params,
              PARAM_PLACEHOLDER
            )
          }
        }
        // fallthrough
      }
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
      case 'prerender-legacy':
      case 'prerender-ppr':
      case 'prerender-client':
      case 'prerender':
      case 'prerender-runtime':
      case 'validation-client':
      case 'generate-static-params': {
        break
      }
      default: {
        workUnitStore satisfies never
      }
    }
  }

  // If the params object is not a proxy
  return params
}

function createPlaceholderParamsForInstantValidation(
  params: Params,
  placeholderValue: string
): Params {
  const placeholderParams: Params = {}
  for (const key in params) {
    placeholderParams[key] = placeholderValue
  }
  return placeholderParams
}

// const METADATA_ID = '__metadata_id__'

// export function excludeMetadataIdFromServerParams<TParams extends Params>(
//   params: TParams
// ): Omit<TParams, '__metadata_id__'> {
//   const workUnitStore = workUnitAsyncStorage.getStore()
//   if (workUnitStore) {
//     switch (workUnitStore.type) {
//       case 'request': {
//         // In build-time instant validation, params can be wrapped in a proxy
//         // that doesn't allow us to destructure the params to extract __metadata_id__.
//         // (If all params are provided, we don't use a proxy, so we can skip creating one here as well)
//         if (workUnitStore.validationSamples) {
//           const { isExhaustiveParamsProxy } =
//             require('./instant-samples') as typeof import('./instant-samples')
//           if (isExhaustiveParamsProxy(params)) {
//             return {} as any
//           }
//         }
//         // fallthrough
//       }
//       case 'cache':
//       case 'private-cache':
//       case 'unstable-cache':
//       case 'prerender-legacy':
//       case 'prerender-ppr':
//       case 'prerender-client':
//       case 'prerender':
//       case 'prerender-runtime':
//       case 'validation-client':
//       case 'generate-static-params': {
//         break
//       }
//       default: {
//         workUnitStore satisfies never
//       }
//     }
//   }

//   // If the params object is not a proxy
//   const { [METADATA_ID]: _, ...cleanedParams } = params
//   return cleanedParams
// }
