export type WaitUntilFn = <T>(promise: Promise<T>) => void

export type AfterTask<T = unknown> = Promise<T> | AfterCallback<T>
export type AfterCallback<T = unknown> = () => T | Promise<T>
