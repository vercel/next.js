import { createProxy } from "next/dist/build/webpack/loaders/next-flight-loader/module-proxy";

("TURBOPACK { chunking-type: isolatedParallel }");
// @ts-expect-error CLIENT_MODULE is provided by rust
import { __turbopack_module_id__ as id } from "CLIENT_MODULE";

// @ts-expect-error CLIENT_CHUNKS is provided by rust
import client_id, { chunks, chunkListPath } from "CLIENT_CHUNKS";

export default createProxy(
  JSON.stringify([client_id, chunks, chunkListPath, id])
);
