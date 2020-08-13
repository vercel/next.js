// Temporary workaround for the issue described here:
// https://github.com/vercel/next.js/issues/3775#issuecomment-407438123
// The runtimeChunk doesn't have dynamic import handling code when there hasn't been a dynamic import
// The runtimeChunk can't hot reload itself currently to correct it when adding pages using on-demand-entries
// eslint-disable-next-line no-unused-expressions
__REPLACE_NOOP_IMPORT__
import('./next-dev-bs')
