const set = require('../../regenerate/regenerate.js')();
set.addRange(0xAA80, 0xAAC2).addRange(0xAADB, 0xAADF);
exports.characters = set;
