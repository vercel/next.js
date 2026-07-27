// @ts-nocheck
/* eslint-disable */

// Re-export unstable APIs from next/cache
export { cacheTag, cacheLife, revalidatePath} from 'next/cache'

// Re-export with aliases
export { cacheTag as createTag, cacheLife as createLife } from 'next/cache'

// Default export should not be affected
export { default as cache } from 'next/cache'