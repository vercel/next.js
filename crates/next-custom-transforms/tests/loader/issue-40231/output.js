"use strict";
function loadSomethingWithDynamicImport(param) {
    return import("something/".concat(param)).then(function(r) {
        return r.default;
    });
}
module.exports = {
    loadSomethingWithDynamicImport: loadSomethingWithDynamicImport
};
