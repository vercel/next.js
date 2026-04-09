/**
 * This function should be used to rethrow internal Next.js errors so that they can be handled by the framework.
 * When wrapping an API that uses errors to interrupt control flow, you should use this function before you do any error handling.
 * This function will rethrow the error if it is a Next.js error so it can be handled, otherwise it will do nothing.
 *
 * Read more: [Next.js Docs: `unstable_rethrow`](https://nextjs.org/docs/app/api-reference/functions/unstable_rethrow)
 */
export const unstable_rethrow =
  typeof window === 'undefined'
    ? (
        require('./unstable-rethrow.server') as typeof import('./unstable-rethrow.server')
      ).unstable_rethrow
    : (
        require('./unstable-rethrow.browser') as typeof import('./unstable-rethrow.browser')
      ).unstable_rethrow
