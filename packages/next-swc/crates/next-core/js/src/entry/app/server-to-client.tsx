import { createProxy } from "next/dist/build/webpack/loaders/next-flight-loader/module-proxy";

import client_id, { chunks } from "CLIENT_CHUNKS";

export default createProxy(JSON.stringify([client_id, chunks]));
