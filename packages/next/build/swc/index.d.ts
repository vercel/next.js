export function isWasm(): Promise<boolean>
export function transform(src: string, options?: any): Promise<any>
export function transformSync(src: string, options?: any): any
export function minify(src: string, options: any): Promise<string>
export function minifySync(src: string, options: any): string
export function bundle(options: any): Promise<any>
export function parse(src: string, options: any): any
export const lockfilePatchPromise: { cur?: Promise<void> }
export function initCustomTraceSubscriber(traceFileName?: string): void
export function teardownTraceSubscriber(): void
export function teardownCrashReporter(): void
export function loadBindings(): Promise<void>
