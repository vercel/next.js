// This module is dynamically imported by the page during HMR tests.
// It starts not being imported, then the test adds the import.
export const newModuleValue = 'from-new-module'
export const newModuleEvalTime = Date.now()
