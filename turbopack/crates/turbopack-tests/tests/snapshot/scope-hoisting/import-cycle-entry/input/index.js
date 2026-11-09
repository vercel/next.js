// `page.js` and `left.js` are targets of an `import()`, and each is part of a cycle of imports.
// `shared1.js` and `shared2.js` are merged: no cycle holds them. `left.js` and `right.js` are
// not: `other.js` imports both.
import('./other.js').then(({ other }) => console.log(other.v()))
import('./page.js').then(({ page }) => console.log(page.v()))
import('./left.js').then(({ left }) => console.log(left()))
