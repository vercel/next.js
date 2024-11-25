(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/b1abf_turbopack-tests_tests_snapshot_minification_paren-remover_input_index_032d7e.js", {

"[project]/turbopack/crates/turbopack-tests/tests/snapshot/minification/paren-remover/input/index.js [test] (ecmascript)": (function(__turbopack_context__) {

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, m: module, e: exports, t: __turbopack_require_real__ } = __turbopack_context__;
{
function toFixed(value, maxDecimals, roundingFunction, optionals) {
    var splitValue = value.toString().split('.'), minDecimals = maxDecimals - (optionals || 0), optionalsRegExp, power, output;
    var boundedPrecisions;
    // var unused = 'xxxx';
    // Use the smallest precision value possible to avoid errors from floating point representation
    if (splitValue.length === 2) {
        boundedPrecisions = Math.min(Math.max(splitValue[1].length, minDecimals), maxDecimals);
    } else {
        boundedPrecisions = minDecimals;
    }
    power = Math.pow(10, boundedPrecisions);
    // Multiply up by precision, round accurately, then divide and use native toFixed():
    output = (roundingFunction(value + 'e+' + boundedPrecisions) / power).toFixed(boundedPrecisions);
    if (optionals > maxDecimals - boundedPrecisions) {
        optionalsRegExp = new RegExp('\\.?0{1,' + (optionals - (maxDecimals - boundedPrecisions)) + '}$');
        output = output.replace(optionalsRegExp, '');
    }
    return output;
}
toFixed(1.2345, 2, Math.round, 1);
}}),
}]);

//# sourceMappingURL=b1abf_turbopack-tests_tests_snapshot_minification_paren-remover_input_index_032d7e.js.map