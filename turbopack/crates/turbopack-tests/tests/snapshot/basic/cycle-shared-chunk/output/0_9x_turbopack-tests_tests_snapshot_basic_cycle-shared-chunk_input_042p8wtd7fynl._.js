module.exports=["[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/cycle-shared-chunk/input/entry-a.js [test] (ecmascript, async loader)",((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "output/1jsg_tests_snapshot_basic_cycle-shared-chunk_input_entry-a_1--176l8xsw-8.js",
  "output/0_9x_turbopack-tests_tests_snapshot_basic_cycle-shared-chunk_input_0kgxt8bqr5kmp._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/cycle-shared-chunk/input/entry-a.js [test] (ecmascript)");
    });
});
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/cycle-shared-chunk/input/entry-b.js [test] (ecmascript, async loader)",((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "output/1jsg_tests_snapshot_basic_cycle-shared-chunk_input_entry-b_1b59m_vh39kd_.js",
  "output/0_9x_turbopack-tests_tests_snapshot_basic_cycle-shared-chunk_input_0kgxt8bqr5kmp._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/cycle-shared-chunk/input/entry-b.js [test] (ecmascript)");
    });
});
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/cycle-shared-chunk/input/index.js [test] (ecmascript)",((__turbopack_context__, module, exports) => {

// Two chunk groups that enter the same import cycle (ring-a -> ring-b -> ring-c -> ring-a)
// at different modules. Both need the same set of modules, but reach them in a different
// order, which must not result in two copies of the shared chunk.
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/cycle-shared-chunk/input/entry-a.js [test] (ecmascript, async loader)").then(({ a })=>console.log(a()));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/cycle-shared-chunk/input/entry-b.js [test] (ecmascript, async loader)").then(({ b })=>console.log(b()));
})];

//# sourceMappingURL=0_9x_turbopack-tests_tests_snapshot_basic_cycle-shared-chunk_input_042p8wtd7fynl._.js.map