const UglifyJS = require("uglify-js");
const code = "function add(first, second) { return first + second; }";
const result = UglifyJS.minify(code);
console.log(result);
