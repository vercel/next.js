import type {
  DynamicParamTypesShort,
  DynamicParamTypes,
  FallbackDynamicParamTypes,
  KnownFallbackDynamicParamTypes,
} from './types'

type FallbackDynamicParamTypesShort = Extract<
  DynamicParamTypesShort,
  `f${string}`
>

type KnownFallbackDynamicParamTypesShort = Exclude<
  DynamicParamTypesShort,
  `f${string}`
>

export function isFallbackDynamicParamTypeShort(
  type: DynamicParamTypesShort
): type is FallbackDynamicParamTypesShort {
  // We check if the type starts with `f`.
  return type.startsWith('f')
}

export function getFallbackDynamicParamTypeShort(
  type: FallbackDynamicParamTypesShort
): KnownFallbackDynamicParamTypesShort {
  // We slice the `f` prefix from the type.
  return type.slice(1) as KnownFallbackDynamicParamTypesShort
}

export function isFallbackDynamicParamType(
  type: DynamicParamTypes
): type is FallbackDynamicParamTypes {
  // We check if the type starts with `fallback-`.
  return type.startsWith('fallback-')
}

export function createFallbackDynamicParamType(
  type: KnownFallbackDynamicParamTypes
): FallbackDynamicParamTypes {
  // We add the `fallback-` prefix to the type.
  return `fallback-${type}`
}
