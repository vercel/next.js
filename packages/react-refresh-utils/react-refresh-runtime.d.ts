declare module 'react-refresh/runtime' {
  export function injectIntoGlobalHook(...args: any[]): void
  export function register(...args: any[]): void
  export function createSignatureFunctionForTransform(...args: any[]): any
  export function getFamilyByType(...args: any[]): any
  export function isLikelyComponentType(...args: any[]): boolean
  export function performReactRefresh(...args: any[]): void

  const RefreshRuntime: {
    injectIntoGlobalHook: typeof injectIntoGlobalHook
    register: typeof register
    createSignatureFunctionForTransform: typeof createSignatureFunctionForTransform
    getFamilyByType: typeof getFamilyByType
    isLikelyComponentType: typeof isLikelyComponentType
    performReactRefresh: typeof performReactRefresh
  }

  export default RefreshRuntime
}
