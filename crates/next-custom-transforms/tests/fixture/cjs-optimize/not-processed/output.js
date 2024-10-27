const foo = require('next/server');
const preserved = require('next/unmatched');
console.log(foo.Response);
console.log(foo['Re' + 'spawn']);
console.log(preserved.Preserved);
