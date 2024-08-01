const CHUNK_PUBLIC_PATH = "output/index.entry.js";
const runtime = require("./[turbopack]_runtime.js");
runtime.loadChunk("output/crates_turbopack-tests_tests_snapshot_basic_async_chunk_build_input_baff26._.js");
runtime.loadChunk("output/79fb1_turbopack-tests_tests_snapshot_basic_async_chunk_build_input_import_0c7896.js");
runtime.getOrInstantiateRuntimeModule("[project]/crates/turbopack-tests/tests/snapshot/basic/async_chunk_build/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH);
module.exports = runtime.getOrInstantiateRuntimeModule("[project]/crates/turbopack-tests/tests/snapshot/basic/async_chunk_build/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH).exports;