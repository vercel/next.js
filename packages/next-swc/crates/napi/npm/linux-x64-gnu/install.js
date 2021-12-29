const { glibcVersionRuntime } = process.report.getReport().header;
const { name } = require('./package.json');

if (glibcVersionRuntime && name.endsWith('-gnu') || !glibcVersionRuntime && !name.endsWith('-gnu')) {
  process.exit(0);
} else {
  process.exit(1);
}
