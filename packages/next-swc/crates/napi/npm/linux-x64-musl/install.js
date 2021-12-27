const { family } = require('detect-libc');
const { name } = require('./package.json');

if (family === 'musl' && name.endsWith('-musl') || family !== 'musl' && !name.endsWith('-musl')) {
  process.exit(0);
} else {
  process.exit(1);
}
