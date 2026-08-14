// No 'use strict': assigning to an undeclared name creates a global instead of
// throwing a ReferenceError.
undeclaredGlobal = 42

exports.value = undeclaredGlobal
