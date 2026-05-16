var path = require("path");
var path2 = require("path");
var os = require("os");

var knownWindowsPackages = {
  "win32 arm64 LE": "esbuild-windows-arm64",
  "win32 ia32 LE": "esbuild-windows-32",
  "win32 x64 LE": "esbuild-windows-64",
};
var knownUnixlikePackages = {
  "android arm64 LE": "esbuild-android-arm64",
  "darwin arm64 LE": "esbuild-darwin-arm64",
  "darwin x64 LE": "esbuild-darwin-64",
  "freebsd arm64 LE": "esbuild-freebsd-arm64",
  "freebsd x64 LE": "esbuild-freebsd-64",
  "linux arm LE": "esbuild-linux-arm",
  "linux arm64 LE": "esbuild-linux-arm64",
  "linux ia32 LE": "esbuild-linux-32",
  "linux mips64el LE": "esbuild-linux-mips64le",
  "linux ppc64 LE": "esbuild-linux-ppc64le",
  "linux s390x BE": "esbuild-linux-s390x",
  "linux x64 LE": "esbuild-linux-64",
  "netbsd x64 LE": "esbuild-netbsd-64",
  "openbsd x64 LE": "esbuild-openbsd-64",
  "sunos x64 LE": "esbuild-sunos-64",
};
function pkgAndSubpathForCurrentPlatform() {
  let pkg;
  let subpath;
  let platformKey = `${process.platform} ${os.arch()} ${os.endianness()}`;
  if (platformKey in knownWindowsPackages) {
    pkg = knownWindowsPackages[platformKey];
    subpath = "esbuild.exe";
  } else if (platformKey in knownUnixlikePackages) {
    pkg = knownUnixlikePackages[platformKey];
    subpath = "bin/esbuild";
  } else {
    throw new Error(`Unsupported platform: ${platformKey}`);
  }
  return { pkg, subpath };
}
function generateBinPath() {
  if (ESBUILD_BINARY_PATH) {
    return ESBUILD_BINARY_PATH;
  }
  const { pkg, subpath } = pkgAndSubpathForCurrentPlatform();
  let binPath;
  try {
    binPath = require.resolve(`${pkg}/${subpath}`);
  } catch (e) {
    binPath = downloadedBinPath(pkg, subpath);
    if (!fs.existsSync(binPath)) {
      try {
        require.resolve(pkg);
      } catch {
        throw new Error(`The package "${pkg}" could not be found, and is needed by esbuild.

If you are installing esbuild with npm, make sure that you don't specify the
"--no-optional" flag. The "optionalDependencies" package.json feature is used
by esbuild to install the correct binary executable for your current platform.`);
      }
      throw e;
    }
  }
  let isYarnPnP = false;
  try {
    require("pnpapi");
    isYarnPnP = true;
  } catch (e) {}
  if (isYarnPnP) {
    const esbuildLibDir = path.dirname(require.resolve("esbuild"));
    const binTargetPath = path.join(
      esbuildLibDir,
      `pnpapi-${pkg}-${path.basename(subpath)}`
    );
    if (!fs.existsSync(binTargetPath)) {
      fs.copyFileSync(binPath, binTargetPath);
      fs.chmodSync(binTargetPath, 493);
    }
    return binTargetPath;
  }
  return binPath;
}
var esbuildCommandAndArgs = () => {
  if (
    (!ESBUILD_BINARY_PATH || false) &&
    (path2.basename(__filename) !== "main.js" ||
      path2.basename(__dirname) !== "lib")
  ) {
    throw new Error(`The esbuild JavaScript API cannot be bundled. Please mark the "esbuild" package as external so it's not included in the bundle.

More information: The file containing the code for esbuild's JavaScript API (${__filename}) does not appear to be inside the esbuild package on the file system, which usually means that the esbuild package was bundled into another file. This is problematic because the API needs to run a binary executable inside the esbuild package which is located using a relative path from the API code to the executable. If the esbuild package is bundled, the relative path will be incorrect and the executable won't be found.`);
  }
  if (false) {
    return ["node", [path2.join(__dirname, "..", "bin", "esbuild")]];
  }
  return [generateBinPath(), []];
};
let [command, args] = esbuildCommandAndArgs();
let x = args.concat(`--service=${"0.14.12"}`, "--ping");
