const notAvailableInClient = (name: string) => {
  return function notAvailable(): never {
    throw new Error(`\`${name}\` is only available in a Server Component.`)
  }
}

export function unstable_cache<T extends (...args: any[]) => any>(
  callback: T
): T {
  if (typeof callback !== 'function') return callback
  return function cached(this: unknown, ...args: Parameters<T>) {
    return callback.apply(this, args)
  } as T
}

export function unstable_noStore() {}

export { io } from '../client/request/io.browser'

export const updateTag = notAvailableInClient('updateTag')
export const revalidateTag = notAvailableInClient('revalidateTag')
export const revalidatePath = notAvailableInClient('revalidatePath')
export const refresh = notAvailableInClient('refresh')
export const cacheLife = notAvailableInClient('cacheLife')
export const unstable_cacheLife = notAvailableInClient('unstable_cacheLife')
export const cacheTag = notAvailableInClient('cacheTag')
export const unstable_cacheTag = notAvailableInClient('unstable_cacheTag')
export const unstable_navigation = notAvailableInClient('unstable_navigation')
export const unstable_prefetch = notAvailableInClient('unstable_prefetch')
