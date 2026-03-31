// next-contentlayer is relying on this internal path
// https://github.com/contentlayerdev/contentlayer/blob/2f491c540e1d3667577f57fa368b150bff427aaf/packages/next-contentlayer/src/hooks/useLiveReload.ts#L1
// Drop this file if https://github.com/contentlayerdev/contentlayer/pull/649 is merged/released
export { addMessageListener } from '../hot-reloader/pages/websocket'
