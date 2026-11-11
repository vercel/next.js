// Top-level await makes this module, and every module importing it, an async module.
export const asyncValue = await Promise.resolve('async value')
