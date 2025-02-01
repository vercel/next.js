const CHUNK_PUBLIC_PATH = "output/index.entry.js";
const runtime = require("./[turbopack]_runtime.js");
runtime.loadChunk("output/b1abf_turbopack-tests_tests_snapshot_basic_async_chunk_build_input_import_6f110a.js");
runtime.loadChunk("output/4e721_crates_turbopack-tests_tests_snapshot_basic_async_chunk_build_input_1e4137._.js");
runtime.getOrInstantiateRuntimeModule("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_chunk_build/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH);
module.exports = runtime.getOrInstantiateRuntimeModule("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_chunk_build/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH).exports;