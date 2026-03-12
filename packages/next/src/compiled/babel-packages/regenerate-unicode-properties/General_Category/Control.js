const set = require('../../regenerate/regenerate.js')();
set.addRange(0x0, 0x1F).addRange(0x7F, 0x9F);
exports.characters = set;
