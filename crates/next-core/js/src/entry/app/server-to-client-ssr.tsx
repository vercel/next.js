import { createProxy } from "next/dist/build/webpack/loaders/next-flight-loader/module-proxy";

("TURBOPACK { transition: next-ssr-client-module; chunking-type: parallel }");
import { __turbopack_module_id__ as id } from ".";

("TURBOPACK { transition: next-client-chunks }");
import client_id, { chunks } from ".";

export default createProxy(JSON.stringify([client_id, chunks, id]));
