const set = require('../../regenerate/regenerate.js')();
set.addRange(0x7C0, 0x7FA).addRange(0x7FD, 0x7FF);
exports.characters = set;
