// Imported by the client components of both `loading.tsx` and `page.tsx`.
export const SHARED_MARKER = 'loading-page-shared-marker-7d2e9b41'

export function sharedValue(prefix: string): string {
  return `${prefix}:${SHARED_MARKER}`
}
