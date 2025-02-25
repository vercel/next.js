(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/4c35f_tests_snapshot_side-effects-optimization_resolve-errors_input_86fc7208._.js", {

"[project]/turbopack/crates/turbopack-tests/tests/snapshot/side-effects-optimization/resolve-errors/input/index.js [test] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, d: __dirname } = __turbopack_context__;
{
__turbopack_context__.s({});
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$side$2d$effects$2d$optimization$2f$resolve$2d$errors$2f$input$2f$node_modules$2f$ramda$2f$index$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/side-effects-optimization/resolve-errors/input/node_modules/ramda/index.js [test] (ecmascript)");
;
console.log((0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$side$2d$effects$2d$optimization$2f$resolve$2d$errors$2f$input$2f$node_modules$2f$ramda$2f$index$2e$js__$5b$test$5d$__$28$ecmascript$29$__["pipe"])('a', 'b', 'c'));
console.log((0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$side$2d$effects$2d$optimization$2f$resolve$2d$errors$2f$input$2f$node_modules$2f$ramda$2f$index$2e$js__$5b$test$5d$__$28$ecmascript$29$__["pipe"])('a', 'b', 'c'));
it('should import only pipe.js', ()=>{
    const modules = Object.keys(("TURBOPACK member replacement", __turbopack_context__.M));
    expect(modules).toContainEqual(expect.stringMatching(/input\/node_modules\/ramda\/pipe/));
    expect(modules).not.toContainEqual(expect.stringMatching(/input\/node_modules\/ramda\/index/));
});
}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/side-effects-optimization/resolve-errors/input/node_modules/ramda/pipe.js [test] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, d: __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "pipe": (()=>pipe)
});
const pipe = (a, b, c)=>{
    console.log(a, b, c);
};
}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/side-effects-optimization/resolve-errors/input/node_modules/ramda/index.js [test] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, d: __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "pipe": (()=>__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$side$2d$effects$2d$optimization$2f$resolve$2d$errors$2f$input$2f$node_modules$2f$ramda$2f$pipe$2e$js__$5b$test$5d$__$28$ecmascript$29$__["pipe"])
});
(()=>{
    const e = new Error("Cannot find module './missing.js'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
})();
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$side$2d$effects$2d$optimization$2f$resolve$2d$errors$2f$input$2f$node_modules$2f$ramda$2f$pipe$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/side-effects-optimization/resolve-errors/input/node_modules/ramda/pipe.js [test] (ecmascript)");
;
;
}}),
}]);

//# sourceMappingURL=4c35f_tests_snapshot_side-effects-optimization_resolve-errors_input_86fc7208._.js.map