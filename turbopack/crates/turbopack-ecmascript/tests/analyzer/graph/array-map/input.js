const a = ["../lib/a.js", "../lib/b.js"];
const b = ["../lib/a.js", "../lib/b.js"].map(function (file) {
  return file;
});
const c = ["../lib/a.js", "../lib/b.js"].map(function (file) {
  return [file];
});
const d = ["../lib/a.js", "../lib/b.js"].map(function (file) {
  return require.resolve(file);
});
function func(file) {
  return require.resolve(file);
}
