import { createServerReference, callServer, findSourceMapURL } from "private-next-rsc-action-client-wrapper";
const $$RSC_SERVER_ACTION_0 = /*#__PURE__*/ createServerReference("00ab21efdafbe611287bc25c0462b1e0510d13e48b", callServer, void 0, findSourceMapURL, "foo");
export { $$RSC_SERVER_ACTION_0 as foo };
__turbopack_emit__("./item.js", {
    namespace: 'next/server-actions/browser-nodejs',
    data: "00ab21efdafbe611287bc25c0462b1e0510d13e48b\0foo\0/app/item.js",
    with: {
        'turbopack-transition': 'next-rsc'
    }
});
__turbopack_emit__("./item.js", {
    namespace: 'next/server-actions/browser-edge',
    data: "00ab21efdafbe611287bc25c0462b1e0510d13e48b\0foo\0/app/item.js",
    with: {
        'turbopack-transition': 'next-edge-rsc'
    }
});
