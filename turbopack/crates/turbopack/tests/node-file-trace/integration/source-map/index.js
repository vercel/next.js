const { readFileSync } = require("fs");
const { join } = require("path");

const { Status } = require("./constants");

console.log(Status.OK);
// prevent analyzer from `readFileSync`
const filename = ["constants", "js", "map"];
const cm = readFileSync(join(__dirname, filename.join("."))).toString("utf8");
console.log(JSON.parse(cm).version);
