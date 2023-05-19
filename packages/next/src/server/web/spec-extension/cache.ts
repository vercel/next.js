// const cacheExports = {
//   unstable_cache: require('next/dist/server/web/spec-extension/unstable-cache')
//     .unstable_cache,
//   revalidateTag: require('next/dist/server/web/spec-extension/revalidate-tag')
//     .revalidateTag,
//   revalidatePath: require('next/dist/server/web/spec-extension/revalidate-path')
//     .revalidatePath,
// }

// // https://nodejs.org/api/esm.html#commonjs-namespaces
// // When importing CommonJS modules, the module.exports object is provided as the default export
// module.exports = cacheExports

// // make import { xxx } from 'next/server' work
// exports.unstable_cache = cacheExports.unstable_cache
// exports.revalidatePath = cacheExports.revalidatePath
// exports.revalidateTag = cacheExports.revalidateTag

export { unstable_cache } from './unstable-cache'
export { revalidateTag } from './revalidate-tag'
export { revalidatePath } from './revalidate-path'
