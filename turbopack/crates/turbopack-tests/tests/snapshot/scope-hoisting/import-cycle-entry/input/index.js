// `page.js` and `left.js` are targets of an `import()`, and each is part of a cycle of imports.
// `shared1.js` and `shared2.js` are merged: no cycle holds them, and no `require()` loads an
// entry that imports them (`lazy.js` is required, but its `import()` evaluates `page.js` later).
// `left.js` and `right.js` are not merged: `other.js` imports both. `leaf.js` is merged with
// `right.js`, the only module that imports it.
import('./other.js').then(({ other }) => console.log(other.v()))
import('./page.js').then(({ page }) => console.log(page.v()))
import('./left.js').then(({ left }) => console.log(left()))
globalThis.lazy = () => require('./lazy.js')
// `plain1.js` and `plain2.js` are merged with two ways in. `required.js` is required and imports
// both, like `second.js`, but no entry that imports them is part of a cycle.
import('./second.js')
globalThis.required = () => require('./required.js')
