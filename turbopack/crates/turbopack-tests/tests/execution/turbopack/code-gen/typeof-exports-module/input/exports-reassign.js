exports = () => 'hello'
if (typeof exports === 'object') throw 'oh no'
module.exports = 1234
