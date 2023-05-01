(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/crates_turbopack-tests_tests_snapshot_imports_json_input_index_b53fce.js", {

"[project]/crates/turbopack-tests/tests/snapshot/imports/json/input/invalid.json (json)": (() => {{

throw new Error("An error occurred while generating the chunk item [project]/crates/turbopack-tests/tests/snapshot/imports/json/input/invalid.json (json)\n\nCaused by:\n- Unable to make a module from invalid JSON: expected `,` or `}` at line 3 column 26\n\nDebug info:\n- An error occurred while generating the chunk item [project]/crates/turbopack-tests/tests/snapshot/imports/json/input/invalid.json (json)\n- Execution of module_factory failed\n- Execution of JsonChunkItem::content failed\n- Unable to make a module from invalid JSON: expected `,` or `}` at line 3 column 26\n    at nested.?\n       1 | {\n       2 |   \"nested\": {\n         |                          v\n       3 +     \"this-is\": \"invalid\" // lint-staged will remove trailing commas, so here's a comment\n         |                          ^\n       4 |   }\n       5 | }");

}}),
"[project]/crates/turbopack-tests/tests/snapshot/imports/json/input/package.json (json)": (({ r: __turbopack_require__, x: __turbopack_external_require__, f: __turbopack_require_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, l: __turbopack_load__, j: __turbopack_cjs__, k: __turbopack_refresh__, g: global, __dirname }) => (() => {

__turbopack_export_value__(JSON.parse("{\"name\":\"json-snapshot\"}"));
})()),
"[project]/crates/turbopack-tests/tests/snapshot/imports/json/input/index.js (ecmascript)": (({ r: __turbopack_require__, x: __turbopack_external_require__, f: __turbopack_require_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, l: __turbopack_load__, j: __turbopack_cjs__, k: __turbopack_refresh__, g: global, __dirname }) => (() => {

var __TURBOPACK__imported__module__$5b$project$5d2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$json$2f$input$2f$package$2e$json__$28$json$29$__ = __turbopack_import__("[project]/crates/turbopack-tests/tests/snapshot/imports/json/input/package.json (json)");
var __TURBOPACK__imported__module__$5b$project$5d2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$json$2f$input$2f$invalid$2e$json__$28$json$29$__ = __turbopack_import__("[project]/crates/turbopack-tests/tests/snapshot/imports/json/input/invalid.json (json)");
"__TURBOPACK__ecmascript__hoisting__location__";
;
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$json$2f$input$2f$package$2e$json__$28$json$29$__["default"].name);
;
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$json$2f$input$2f$invalid$2e$json__$28$json$29$__["default"]["this-is"]);

})()),
}]);

//# sourceMappingURL=crates_turbopack-tests_tests_snapshot_imports_json_input_index_b53fce.js.map