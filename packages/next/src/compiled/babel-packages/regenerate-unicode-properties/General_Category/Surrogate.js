const set = require('../../regenerate/regenerate.js')();
set.addRange(0xD800, 0xDFFF);
exports.characters = set;
