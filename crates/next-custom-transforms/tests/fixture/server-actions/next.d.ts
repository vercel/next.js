declare module 'private-next-rsc-action-encryption' {
  export function encryptActionBoundArgs(
    actionId: string,
    ...args: any[]
  ): Promise<string>

  export function decryptActionBoundArgs(
    actionId: string,
    encryptedPromise: Promise<string>
  ): Promise<any[]>
}

declare module 'private-next-rsc-server-reference' {
  export function registerServerReference<T extends (...args: any[]) => any>(
    reference: T,
    id: string,
    exportName: string | null
  ): T
}

declare module 'private-next-rsc-action-client-wrapper' {
  export function callServer(
    actionId: string,
    actionArgs: unknown[]
  ): Promise<unknown>

  export function findSourceMapURL(filename: string): string | null

  const createServerReference: (
    id: string,
    callServer: any,
    encodeFormAction?: any,
    findSourceMapURL?: any,
    functionName?: string
  ) => (...args: unknown[]) => Promise<unknown>
}

declare module 'private-next-rsc-action-validate' {
  function ensureServerEntryExports(actions: unknown[]): void
}

declare module 'private-next-rsc-cache-wrapper' {
  export function cache<TFn extends (...args: any[]) => Promise<any>>(
    kind: string,
    id: string,
    boundArgsLength: number,
    fn: TFn
  ): TFn
}
