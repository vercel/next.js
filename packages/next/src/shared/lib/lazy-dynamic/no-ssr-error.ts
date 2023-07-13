// This has to be a shared module which is shared between client component error boundary and dynamic component

export const NEXT_DYNAMIC_NO_SSR_CODE = 'NEXT_DYNAMIC_NO_SSR_CODE'
export const isNextDynamicNoSSRError = (err: any) =>
  err && err.digest === NEXT_DYNAMIC_NO_SSR_CODE
