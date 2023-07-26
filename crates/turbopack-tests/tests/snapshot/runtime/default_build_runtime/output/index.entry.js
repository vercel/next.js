const CHUNK_PUBLIC_PATH = "output/index.entry.js";
const runtime = require("./[turbopack]_runtime.js");
runtime.loadChunk("output/79fb1_turbopack-tests_tests_snapshot_runtime_default_build_runtime_input_index_e254c5.js");
runtime.getOrInstantiateRuntimeModule("[project]/crates/turbopack-tests/tests/snapshot/runtime/default_build_runtime/input/index.js (ecmascript)", CHUNK_PUBLIC_PATH);
const internalModule = runtime.getOrInstantiateRuntimeModule("[project]/crates/turbopack-tests/tests/snapshot/runtime/default_build_runtime/input/index.js (ecmascript)", CHUNK_PUBLIC_PATH);
module.exports = internalModule.namespace ?? internalModule.exports;