const set = require('../../regenerate/regenerate.js')();
set.addRange(0x10100, 0x10101).addRange(0x12F90, 0x12FF2);
exports.characters = set;
