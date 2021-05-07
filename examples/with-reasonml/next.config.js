const bsconfig = require('./bsconfig.json');
const fs = require("fs");

const transpileModules = ["rescript"].concat(bsconfig["bs-dependencies"]);
const withTM = require("next-transpile-modules")(transpileModules);

// There is an issue where webpack doesn't detect npm packages within node_modules when
// there is no dedicated package.json "main" entry + index.js file existent.
// This function will make sure that every ReScript dependency folder is conforming
// to webpack's resolve mechanism
//
// This will eventually be removed at some point, so keep an eye out for updates
// on our template repository.
function patchResDeps() {
  ["rescript"].concat(bsconfig["bs-dependencies"]).forEach((bsDep) => {
    fs.writeFileSync(`./node_modules/${bsDep}/index.js`, "");
    const json = require(`./node_modules/${bsDep}/package.json`);
    json.main = "index.js";
    fs.writeFileSync(
      `./node_modules/${bsDep}/package.json`,
      JSON.stringify(json, null, 2)
    );
  });
}
patchResDeps(); // update package.json and create empty `index.js` before transpiling

module.exports = withTM({
  pageExtensions: ['jsx', 'js', 'mjs'],
})
