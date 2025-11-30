// Test case for variable name conflicts during function inlining
// This demonstrates the issue where inner function variables conflict with outer scope
// when functions are inlined during minification

function outerFunction(x) {
  // Inner function that uses the same variable name 'x' from outer scope
  function innerFunction() {
    return x + 1;
  }
  
  // Call inner function and use outer variable 'x'
  const result = innerFunction() + x;
  
  // Another inner function with its own 'x' parameter
  function anotherInner(y) {
    const x = y * 2;
    return x + 1;
  }
  
  return result + anotherInner(5);
}

// Export to make it a module
module.exports = outerFunction;

