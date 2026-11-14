// Exports only through top-level `this`, which is `module.exports`. Reading
// `this.base` lets the exports escape, so nothing may be dropped.
this.base = 'base-value'
this.derived = this.base + '!'
