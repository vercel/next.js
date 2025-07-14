(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/4e721_crates_turbopack-tests_tests_snapshot_comptime_assignment_input_index_ef20e8c9.js", {

"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/assignment/input/index.js [test] (ecmascript)": ((__turbopack_context__) => {

var { m: module, e: exports } = __turbopack_context__;
{
function simpleAssignment() {
    function staticDecl() {
        const bool = true;
        if ("TURBOPACK compile-time truthy", 1) {
            console.log('branch should not be eliminated');
        } else //TURBOPACK unreachable
        ;
    }
    function staticExpr() {
        let bool = false;
        bool = true;
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
    function dynamicDecl() {
        function dynamic() {
            return true;
        }
        const bool = dynamic();
        if ("TURBOPACK compile-time truthy", 1) {
            console.log('branch should not be eliminated');
        } else //TURBOPACK unreachable
        ;
    }
    function dynamicExpr() {
        function dynamic() {
            return true;
        }
        let bool = false;
        bool = dynamic();
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
}
function objectPatterns() {
    function staticDecl() {
        const { bool } = {
            bool: true
        };
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
    function staticExpr() {
        let bool = false;
        ({ bool } = {
            bool: true
        });
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
    function dynamicDecl() {
        function dynamic() {
            return {
                bool: true
            };
        }
        const { bool } = dynamic();
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
    function dynamicExpr() {
        function dynamic() {
            return {
                bool: true
            };
        }
        let bool = false;
        ({ bool } = dynamic());
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
}
function arrayPatterns() {
    function staticDecl() {
        const [bool] = [
            true
        ];
        if ("TURBOPACK compile-time truthy", 1) {
            console.log('branch should not be eliminated');
        } else //TURBOPACK unreachable
        ;
    }
    function staticExpr() {
        let bool = false;
        [bool] = [
            true
        ];
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
    function dynamicDecl() {
        function dynamic() {
            return [
                true
            ];
        }
        const [bool] = dynamic();
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
    function dynamicExpr() {
        function dynamic() {
            return [
                true
            ];
        }
        let bool = false;
        [bool] = dynamic();
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
}
function nestedPatterns() {
    function staticDecl() {
        const { inner: [bool] } = {
            inner: [
                true
            ]
        };
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
    function staticExpr() {
        let bool = false;
        ({ inner: [bool] } = {
            inner: [
                true
            ]
        });
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
    function dynamicDecl() {
        function dynamic() {
            return {
                inner: [
                    true
                ]
            };
        }
        const { inner: [bool] } = dynamic();
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
    function dynamicExpr() {
        function dynamic() {
            return {
                inner: [
                    true
                ]
            };
        }
        let bool = false;
        ({ inner: [bool] } = dynamic());
        if (bool) {
            console.log('branch should not be eliminated');
        } else {
            console.log('this branch is not taken');
        }
    }
}
}}),
}]);

//# sourceMappingURL=4e721_crates_turbopack-tests_tests_snapshot_comptime_assignment_input_index_ef20e8c9.js.map