// Same page as the node runtime, but served from the edge runtime so the
// edge decode paths in `handleAction` are exercised too.
export const runtime = 'edge'

export { default } from '../page'
