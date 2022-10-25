var path = require("path");
var path2 = require("path");

var knownWindowsPackages = {
  "win32 arm64 LE": "esbuild-windows-arm64",
  "win32 ia32 LE": "esbuild-windows-32",
  "win32 x64 LE": "esbuild-windows-64",
};
function pkgAndSubpathForCurrentPlatform() {
  let pkg;
  let subpath;
  pkg = knownWindowsPackages[platformKey];
  subpath = "esbuild.exe";
  return { pkg, subpath };
}
function generateBinPath() {
  const { pkg, subpath } = pkgAndSubpathForCurrentPlatform();
  let binPath;
  try {
    binPath = require.resolve(`${pkg}/${subpath}`);
  } catch (e) {}
  return binPath;
}
let x = generateBinPath();
