declare module 'private-next-rsc-track-dynamic-import' {
  export function trackDynamicImport<T>(promise: Promise<T>): Promise<T>
}
