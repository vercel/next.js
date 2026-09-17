(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1ngs_js-remove-unused-exports_define-property-getter-reads-export_input_0v-648lm7l0vi._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/define-property-getter-reads-export/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$cjs$2d$remove$2d$unused$2d$exports$2f$define$2d$property$2d$getter$2d$reads$2d$export$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/define-property-getter-reads-export/input/lib.js [test] (ecmascript)");
;
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$cjs$2d$remove$2d$unused$2d$exports$2f$define$2d$property$2d$getter$2d$reads$2d$export$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__["b"]);
__turbopack_context__.s([]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/define-property-getter-reads-export/input/lib.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// `b`'s getter reads `exports.a`, so `a` is reachable through `b`. That read must
// taint the module (nothing dropped), even though only `b` is imported.
Object.defineProperty(exports, '__esModule', {
    value: true
});
Object.defineProperty(exports, 'a', {
    enumerable: true,
    get: function() {
        return 'a-value';
    }
});
Object.defineProperty(exports, 'b', {
    enumerable: true,
    get: function() {
        return exports.a;
    }
});
}),
]);

//# sourceMappingURL=1ngs_js-remove-unused-exports_define-property-getter-reads-export_input_0v-648lm7l0vi._.js.map