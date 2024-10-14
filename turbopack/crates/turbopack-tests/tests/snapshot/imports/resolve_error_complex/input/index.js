let specifier = "does-not-exist/path";
if (x) {
  specifier = "does-not-exist-either/path"
}
if (y) {
  specifier = y;
}

console.log(require(specifier));
