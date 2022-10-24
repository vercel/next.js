import { createProxy } from "next/dist/build/webpack/loaders/next-flight-loader/module-proxy";

("TURBOPACK { transition: next-client-chunks }");
import client_id, { chunks } from ".";

export default createProxy(JSON.stringify([client_id, chunks]));
