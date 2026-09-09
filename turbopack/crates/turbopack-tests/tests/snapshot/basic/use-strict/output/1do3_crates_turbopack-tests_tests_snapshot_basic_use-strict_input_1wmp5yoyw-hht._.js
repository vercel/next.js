(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1do3_crates_turbopack-tests_tests_snapshot_basic_use-strict_input_1wmp5yoyw-hht._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/use-strict/input/non-strict.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = function() {
    return this === globalThis ? 34 : 0;
}();
}),
(function(){"use strict";return[
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/use-strict/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

const strictA = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/use-strict/input/strict-a.js [test] (ecmascript)");
const strictB = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/use-strict/input/strict-b.js [test] (ecmascript)").default;
const sloppy = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/use-strict/input/non-strict.js [test] (ecmascript)");
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/use-strict/input/below-threshold.js [test] (ecmascript, async loader)").then(({ value })=>{
    console.log('below threshold', value);
});
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/use-strict/input/all-strict.js [test] (ecmascript, async loader)").then(({ value })=>{
    console.log('all strict', value);
});
console.log('this is CJS', strictA, strictB, sloppy);
module.exports = strictA + strictB + sloppy;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/use-strict/input/strict-a.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = 1000;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/use-strict/input/strict-b.js [test] (ecmascript)", ((__turbopack_context__) => {

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
const __TURBOPACK__default__export__ = 200;
}),
]})(),
]);

//# sourceMappingURL=1do3_crates_turbopack-tests_tests_snapshot_basic_use-strict_input_1wmp5yoyw-hht._.js.map