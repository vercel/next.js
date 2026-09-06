// `viaThis` is pure and never imported by name, so it looks droppable. But it is
// read through `this` in a top-level arrow — where `this` aliases `exports` — so
// the module must be treated as opaque CommonJS and nothing may be dropped.
exports.viaThis = 'V'
exports.leak = () => this.viaThis
