var module = {};
(function main(global, module) {
    module.exports = function() {};
    module.exports.create = function() {};
})(function() {
    return this || {};
}(), module, false);
export default module.exports;
export var create = module.exports.create;
