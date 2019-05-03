import * as babel from "@babel/core"

export default function injectCaller (opts: any) {
  if (!supportsCallerOption()) return opts;

  return Object.assign({}, opts, {
    caller: Object.assign(
      {
        name: "babel-loader",

        // Webpack >= 2 supports ESM and dynamic import.
        supportsStaticESM: true,
        supportsDynamicImport: true,
      },
      opts.caller,
    ),
  });
};

// TODO: We can remove this eventually, I'm just adding it so that people have
// a little time to migrate to the newer RCs of @babel/core without getting
// hard-to-diagnose errors about unknown 'caller' options.
let supportsCallerOptionFlag: any = undefined;
function supportsCallerOption() {
  if (supportsCallerOptionFlag === undefined) {
    try {
      // Rather than try to match the Babel version, we just see if it throws
      // when passed a 'caller' flag, and use that to decide if it is supported.
      babel.loadPartialConfig({
        // @ts-ignore
        caller: undefined,
        babelrc: false,
        configFile: false,
      });
      supportsCallerOptionFlag = true;
    } catch (err) {
      supportsCallerOptionFlag = false;
    }
  }

  return supportsCallerOptionFlag;
}
