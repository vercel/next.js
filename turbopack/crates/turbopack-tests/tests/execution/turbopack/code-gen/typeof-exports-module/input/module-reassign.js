module = () => 'hello'
if (typeof module === 'object') throw 'oh no'
exports.foo = 1234
