(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/_09xmnl_._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/util.js [test] (ecmascript) <internal part 0>", (function(__turbopack_context__){
"use strict";

__turbopack_context__.s([
    "a",
    ()=>test,
    (new_test)=>test = new_test,
    "test",
    ()=>test
]);
function test() {
    return 42;
}
;
;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/async_module.js [test] (ecmascript) <internal part 0>", (function(__turbopack_context__){
"use strict";

return __turbopack_context__.a(function(__turbopack_handle_async_dependencies__, __turbopack_async_result__) {
    var __gen = function*() {
        try {
            __turbopack_context__.s([
                "a",
                ()=>topValue,
                (new_topValue)=>topValue = new_topValue,
                "topValue",
                ()=>topValue
            ]);
            var topValue = yield Promise.resolve('top level async');
            ;
            ;
            ;
            __turbopack_async_result__();
        } catch (e) {
            __turbopack_async_result__(e);
        }
    }();
    (function __step(k, a) {
        try {
            var r = __gen[k](a);
        } catch (e) {
            __turbopack_async_result__(e);
            return;
        }
        if (!r.done) Promise.resolve(r.value).then(function(v) {
            __step('next', v);
        }, function(e) {
            __step('throw', e);
        });
    })('next');
}, true);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/side-effect.js [test] (ecmascript)", (function(__turbopack_context__){
"use strict";

return __turbopack_context__.a(function(__turbopack_handle_async_dependencies__, __turbopack_async_result__) {
    var __gen = function*() {
        try {
            yield Promise.resolve('side effect');
            console.log('side effect executed');
            __turbopack_async_result__();
        } catch (e) {
            __turbopack_async_result__(e);
        }
    }();
    (function __step(k, a) {
        try {
            var r = __gen[k](a);
        } catch (e) {
            __turbopack_async_result__(e);
            return;
        }
        if (!r.done) Promise.resolve(r.value).then(function(v) {
            __step('next', v);
        }, function(e) {
            __step('throw', e);
        });
    })('next');
}, true);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 0>", (function(__turbopack_context__){
"use strict";

;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 2>", (function(__turbopack_context__){
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 0>");
;
;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 4>", (function(__turbopack_context__){
"use strict";

return __turbopack_context__.a(function(__turbopack_handle_async_dependencies__, __turbopack_async_result__) {
    var __gen = function*() {
        try {
            __turbopack_context__.s([
                "a",
                ()=>data,
                (new_data)=>data = new_data
            ]);
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__2$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 2>");
            ;
            // This module tests that user-defined async functions inside a module
            // with top-level await are preserved correctly when the wrapper uses
            // function*/yield (they should already be downleveled by SWC).
            var data = yield fetch('/api/data');
            ;
            __turbopack_async_result__();
        } catch (e) {
            __turbopack_async_result__(e);
        }
    }();
    (function __step(k, a) {
        try {
            var r = __gen[k](a);
        } catch (e) {
            __turbopack_async_result__(e);
            return;
        }
        if (!r.done) Promise.resolve(r.value).then(function(v) {
            __step('next', v);
        }, function(e) {
            __step('throw', e);
        });
    })('next');
}, true);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 6>", (function(__turbopack_context__){
"use strict";

return __turbopack_context__.a(function(__turbopack_handle_async_dependencies__, __turbopack_async_result__) {
    var __gen = function*() {
        try {
            __turbopack_context__.s([
                "c",
                ()=>value,
                (new_value)=>value = new_value,
                "value",
                ()=>value
            ]);
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__4$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 4>");
            var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
                __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__4$3e$__
            ]);
            [__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__4$3e$__] = __turbopack_async_dependencies__.then ? (yield __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
            ;
            var value = yield Promise.resolve(42);
            ;
            ;
            ;
            __turbopack_async_result__();
        } catch (e) {
            __turbopack_async_result__(e);
        }
    }();
    (function __step(k, a) {
        try {
            var r = __gen[k](a);
        } catch (e) {
            __turbopack_async_result__(e);
            return;
        }
        if (!r.done) Promise.resolve(r.value).then(function(v) {
            __step('next', v);
        }, function(e) {
            __step('throw', e);
        });
    })('next');
}, true);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 5>", (function(__turbopack_context__){
"use strict";

return __turbopack_context__.a(function(__turbopack_handle_async_dependencies__, __turbopack_async_result__) {
    var __gen = function*() {
        try {
            __turbopack_context__.s([
                "b",
                ()=>processData,
                (new_processData)=>processData = new_processData,
                "processData",
                ()=>processData
            ]);
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__4$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 4>");
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 0>");
            var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$swc$2b$helpers$40$0$2e$5$2e$15$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_async_to_generator$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/@swc+helpers@0.5.15/node_modules/@swc/helpers/esm/_async_to_generator.js [test] (ecmascript) <internal part 0>");
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__2$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 2>");
            var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$swc$2b$helpers$40$0$2e$5$2e$15$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_ts_generator$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/@swc+helpers@0.5.15/node_modules/@swc/helpers/esm/_ts_generator.js [test] (ecmascript) <internal part 0>");
            var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
                __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__4$3e$__
            ]);
            [__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__4$3e$__] = __turbopack_async_dependencies__.then ? (yield __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
            ;
            ;
            ;
            ;
            ;
            function processData() {
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$swc$2b$helpers$40$0$2e$5$2e$15$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_async_to_generator$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__["_"])(function() {
                    var result;
                    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$swc$2b$helpers$40$0$2e$5$2e$15$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_ts_generator$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__["_"])(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                return [
                                    4,
                                    __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__4$3e$__["a"].json()
                                ];
                            case 1:
                                result = _state.sent();
                                return [
                                    2,
                                    result
                                ];
                        }
                    });
                })();
            }
            ;
            ;
            __turbopack_async_result__();
        } catch (e) {
            __turbopack_async_result__(e);
        }
    }();
    (function __step(k, a) {
        try {
            var r = __gen[k](a);
        } catch (e) {
            __turbopack_async_result__(e);
            return;
        }
        if (!r.done) Promise.resolve(r.value).then(function(v) {
            __step('next', v);
        }, function(e) {
            __step('throw', e);
        });
    })('next');
}, false);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/chained_async.js [test] (ecmascript) <internal part 0>", (function(__turbopack_context__){
"use strict";

return __turbopack_context__.a(function(__turbopack_handle_async_dependencies__, __turbopack_async_result__) {
    var __gen = function*() {
        try {
            __turbopack_context__.s([
                "a",
                ()=>chainedValue,
                (new_chainedValue)=>chainedValue = new_chainedValue,
                "chainedValue",
                ()=>chainedValue
            ]);
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$async_module$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/async_module.js [test] (ecmascript) <internal part 0>");
            var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
                __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$async_module$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__
            ]);
            [__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$async_module$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__] = __turbopack_async_dependencies__.then ? (yield __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
            ;
            ;
            var chainedValue = yield Promise.resolve(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$async_module$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__["topValue"] + ' chained');
            ;
            ;
            ;
            __turbopack_async_result__();
        } catch (e) {
            __turbopack_async_result__(e);
        }
    }();
    (function __step(k, a) {
        try {
            var r = __gen[k](a);
        } catch (e) {
            __turbopack_async_result__(e);
            return;
        }
        if (!r.done) Promise.resolve(r.value).then(function(v) {
            __step('next', v);
        }, function(e) {
            __step('throw', e);
        });
    })('next');
}, true);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/index.js [test] (ecmascript)", (function(__turbopack_context__){
"use strict";

return __turbopack_context__.a(function(__turbopack_handle_async_dependencies__, __turbopack_async_result__) {
    var __gen = function*() {
        try {
            __turbopack_context__.s([]);
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$util$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/util.js [test] (ecmascript) <internal part 0>");
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$async_module$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/async_module.js [test] (ecmascript) <internal part 0>");
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$side$2d$effect$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/side-effect.js [test] (ecmascript)");
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__6$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 6>");
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__5$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/nested_async.js [test] (ecmascript) <internal part 5>");
            var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$chained_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/async_to_generator/input/chained_async.js [test] (ecmascript) <internal part 0>");
            var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
                __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$async_module$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__,
                __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$side$2d$effect$2e$js__$5b$test$5d$__$28$ecmascript$29$__,
                __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__6$3e$__,
                __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__5$3e$__,
                __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$chained_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__
            ]);
            [__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$async_module$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$side$2d$effect$2e$js__$5b$test$5d$__$28$ecmascript$29$__, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__6$3e$__, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__5$3e$__, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$chained_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__] = __turbopack_async_dependencies__.then ? (yield __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
            ;
            ;
            ;
            ;
            ;
            // This module has top-level await via its async_module dependency,
            // which triggers Turbopack's async module wrapper.
            // The wrapper should use a regular function (not async function) when
            // targeting environments without native async support (e.g. chrome 41).
            var result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$util$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__["test"])();
            console.log(result);
            console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$async_module$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__["topValue"]);
            // nested_async.js: tests multiple top-level awaits + user async functions
            console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__6$3e$__["value"]);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$nested_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__5$3e$__["processData"])();
            // chained_async.js: tests async dependency chain
            console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$async_to_generator$2f$input$2f$chained_async$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__0$3e$__["chainedValue"]);
            __turbopack_async_result__();
        } catch (e) {
            __turbopack_async_result__(e);
        }
    }();
    (function __step(k, a) {
        try {
            var r = __gen[k](a);
        } catch (e) {
            __turbopack_async_result__(e);
            return;
        }
        if (!r.done) Promise.resolve(r.value).then(function(v) {
            __step('next', v);
        }, function(e) {
            __step('throw', e);
        });
    })('next');
}, false);
}),
"[project]/node_modules/.pnpm/@swc+helpers@0.5.15/node_modules/@swc/helpers/esm/_async_to_generator.js [test] (ecmascript) <internal part 0>", (function(__turbopack_context__){
"use strict";

__turbopack_context__.s([
    "_",
    ()=>_async_to_generator,
    "a",
    ()=>asyncGeneratorStep,
    (new_asyncGeneratorStep)=>asyncGeneratorStep = new_asyncGeneratorStep,
    "b",
    ()=>_async_to_generator,
    (new__async_to_generator)=>_async_to_generator = new__async_to_generator
]);
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) resolve(value);
    else Promise.resolve(value).then(_next, _throw);
}
function _async_to_generator(fn) {
    return function() {
        var self = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self, args);
            function _next(value) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}
;
;
;
}),
"[project]/node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs [test] (ecmascript) <internal part 16>", (function(__turbopack_context__){
"use strict";

__turbopack_context__.s([
    "n",
    ()=>__generator,
    (new___generator)=>__generator = new___generator
]);
function __generator(thisArg, body) {
    var _ = {
        label: 0,
        sent: function sent() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
        return this;
    }), g;
    //TURBOPACK unreachable
    ;
    function verb(n) {
        return function(v) {
            return step([
                n,
                v
            ]);
        };
    }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while(g && (g = 0, op[0] && (_ = 0)), _)try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [
                op[0] & 2,
                t.value
            ];
            switch(op[0]){
                case 0:
                case 1:
                    t = op;
                    break;
                case 4:
                    _.label++;
                    return {
                        value: op[1],
                        done: false
                    };
                case 5:
                    _.label++;
                    y = op[1];
                    op = [
                        0
                    ];
                    continue;
                case 7:
                    op = _.ops.pop();
                    _.trys.pop();
                    continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                        _ = 0;
                        continue;
                    }
                    if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
                        _.label = op[1];
                        break;
                    }
                    if (op[0] === 6 && _.label < t[1]) {
                        _.label = t[1];
                        t = op;
                        break;
                    }
                    if (t && _.label < t[2]) {
                        _.label = t[2];
                        _.ops.push(op);
                        break;
                    }
                    if (t[2]) _.ops.pop();
                    _.trys.pop();
                    continue;
            }
            op = body.call(thisArg, _);
        } catch (e) {
            op = [
                6,
                e
            ];
            y = 0;
        } finally{
            f = t = 0;
        }
        if (op[0] & 5) throw op[1];
        return {
            value: op[0] ? op[1] : void 0,
            done: true
        };
    }
}
;
}),
"[project]/node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs [test] (ecmascript) <internal part 55>", (function(__turbopack_context__){
"use strict";

__turbopack_context__.s([
    "__generator",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$tslib$40$2$2e$8$2e$1$2f$node_modules$2f$tslib$2f$tslib$2e$es6$2e$mjs__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__16$3e$__["n"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$tslib$40$2$2e$8$2e$1$2f$node_modules$2f$tslib$2f$tslib$2e$es6$2e$mjs__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__16$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs [test] (ecmascript) <internal part 16>");
;
;
}),
"[project]/node_modules/.pnpm/@swc+helpers@0.5.15/node_modules/@swc/helpers/esm/_ts_generator.js [test] (ecmascript) <internal part 0>", (function(__turbopack_context__){
"use strict";

__turbopack_context__.s([
    "_",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$tslib$40$2$2e$8$2e$1$2f$node_modules$2f$tslib$2f$tslib$2e$es6$2e$mjs__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__55$3e$__["__generator"],
    "a",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$tslib$40$2$2e$8$2e$1$2f$node_modules$2f$tslib$2f$tslib$2e$es6$2e$mjs__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__55$3e$__["__generator"],
    (new___generator)=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$tslib$40$2$2e$8$2e$1$2f$node_modules$2f$tslib$2f$tslib$2e$es6$2e$mjs__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__55$3e$__["__generator"] = new___generator
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$tslib$40$2$2e$8$2e$1$2f$node_modules$2f$tslib$2f$tslib$2e$es6$2e$mjs__$5b$test$5d$__$28$ecmascript$29$__$3c$internal__part__55$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs [test] (ecmascript) <internal part 55>");
;
;
;
;
;
}),
]);

//# sourceMappingURL=_09xmnl_._.js.map