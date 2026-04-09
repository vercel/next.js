// @ts-nocheck
/* eslint-disable */

// Re-export unstable APIs from next/cache
export { unstable_cacheTag, unstable_cacheLife, revalidatePath} from 'next/cache'

// Re-export with aliases
export { unstable_cacheTag as createTag, unstable_cacheLife as createLife } from 'next/cache'

// Default export should not be affected
export { default as cache } from 'next/cache'