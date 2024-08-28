import './other-dep.js'

// this cannot be an execution test, because `module` is always defined when running the test in Node.js
console.log(typeof module)
