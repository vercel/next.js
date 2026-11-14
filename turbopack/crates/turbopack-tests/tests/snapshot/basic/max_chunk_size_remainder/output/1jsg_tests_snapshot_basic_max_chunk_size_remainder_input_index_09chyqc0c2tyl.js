(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_basic_max_chunk_size_remainder_input_index_09chyqc0c2tyl.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/max_chunk_size_remainder/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// `page.js` uses all shared modules, and each shared module is also used by one other page. So each
// shared module is its own small chunk in the chunk group of `page.js`, which is not merged with the
// others (merging is not beneficial with the tiny request cost). They all end up in the remained
// chunk, but together they are bigger than `maxChunkSize`, so they form multiple remained chunks
// instead, split between the `a` and `b` directories. Each remained chunk is a merged chunk and
// emits its components as component chunks.
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/max_chunk_size_remainder/input/page.js [test] (ecmascript, async loader)").then(({ page })=>console.log(page));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/max_chunk_size_remainder/input/other/a1.js [test] (ecmascript, async loader)").then(({ other })=>console.log(other));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/max_chunk_size_remainder/input/other/a2.js [test] (ecmascript, async loader)").then(({ other })=>console.log(other));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/max_chunk_size_remainder/input/other/a3.js [test] (ecmascript, async loader)").then(({ other })=>console.log(other));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/max_chunk_size_remainder/input/other/b1.js [test] (ecmascript, async loader)").then(({ other })=>console.log(other));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/max_chunk_size_remainder/input/other/b2.js [test] (ecmascript, async loader)").then(({ other })=>console.log(other));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/max_chunk_size_remainder/input/other/b3.js [test] (ecmascript, async loader)").then(({ other })=>console.log(other));
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_basic_max_chunk_size_remainder_input_index_09chyqc0c2tyl.js.map