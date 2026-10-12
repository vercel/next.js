// Added to lazy.ts's import graph during the test. It starts out unreferenced,
// then the test adds an import of it inside the dynamically-imported module.
// This changes the dynamic chunk's content hash and thus its path.
export const lazyNewModuleValue = 'from-lazy-new-module'
