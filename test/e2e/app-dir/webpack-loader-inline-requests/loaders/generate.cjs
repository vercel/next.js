const path = require('path')

module.exports = function () {
  throw new Error('The generating loader must only run its pitch')
}

module.exports.pitch = function () {
  const value = path.join(__dirname, 'value.cjs')
  const configured = path.join(__dirname, '../fixtures/plain.configured.js')
  const exportedResources = {
    root: 'inline-conditions-loader',
    rootQuery: 'inline-conditions-loader?q=1',
    rootFragment: 'inline-conditions-loader#h',
    rootBoth: 'inline-conditions-loader?q=1#h',
    subpath: 'inline-conditions-loader/subpath',
    subpathQuery: 'inline-conditions-loader/subpath?q=1',
    subpathFragment: 'inline-conditions-loader/subpath#h',
    subpathBoth: 'inline-conditions-loader/subpath?q=1#h',
    explicitQuery: 'inline-conditions-loader/queried?q=1',
    explicitFragment: 'inline-conditions-loader/fragmented#h',
    explicitBoth: 'inline-conditions-loader/both?q=1#h',
    wildcard: 'inline-conditions-loader/wild/loader',
    wildcardQuery: 'inline-conditions-loader/wild/loader?q=1',
    wildcardFragment: 'inline-conditions-loader/wild/loader#h',
    wildcardBoth: 'inline-conditions-loader/wild/loader?q=1#h',
    targetQuery: 'inline-conditions-loader/target-query',
    targetFragment: 'inline-conditions-loader/target-fragment',
    targetBoth: 'inline-conditions-loader/target-both',
    blocked: 'inline-conditions-loader/blocked',
    blockedQuery: 'inline-conditions-loader/blocked?q=1',
    blockedFragment: 'inline-conditions-loader/blocked#h',
  }
  const requests = {
    ordinary: './plain.configured.js',
    single: '!./plain.configured.js',
    double: '!!./plain.configured.js',
    minus: '-!./plain.configured.js',
    singleChain: '!../loaders/append.cjs!./plain.configured.js',
    minusChain: '-!../loaders/append.cjs!./plain.configured.js',
    explicitChain:
      '!!../loaders/append.cjs!../loaders/text.cjs!./input.requestgen',
    combined: `${path.join(__dirname, 'append.cjs')}!./plain.configured.js`,
    relative:
      '!!../loaders/value.cjs?label=relative!./input.requestgen?query#fragment',
    absolute: `!!${value}?label=absolute!${this.resourcePath}?query#fragment`,
    queryA: `!!${value}?label=a!${this.resourcePath}?a#one`,
    queryB: `!!${value}?label=b!${this.resourcePath}?b#two`,
    fragmentA: `!!${value}?label=same!${this.resourcePath}?same#one`,
    fragmentB: `!!${value}?label=same!${this.resourcePath}?same#two`,
    loaderFragmentA: `!!${value}?label=same#first!${this.resourcePath}`,
    loaderFragmentB: `!!${value}?label=same#second!${this.resourcePath}`,
    json: `!!${value}?{"label":"json","number":3}!${this.resourcePath}`,
    encoded: `!!${value}?label=a%20b&label=c!${this.resourcePath}`,
    url: `${value}?label=https://cdn.example.test/!./identity.js`,
    pitch: './input.pitch-request',
    pitchString: './input.pitch-string-request',
    absolutePrefix: `!!${configured}`,
    packageLoader:
      '!!inline-conditions-loader?label=package-query!./identity.js',
    requireCondition: '!!inline-conditions-loader/require!./identity.js',
    nodeCondition: '!!inline-conditions-loader/node!./identity.js',
    loaderSubpath: '!!inline-conditions-loader/subpath!./identity.js',
    loaderMain: '!!inline-main-loader!./identity.js',
    loaderExtension: '!!inline-main-loader/entry!./identity.js',
    esmLoader: '!!inline-conditions-loader/esm!./identity.js',
    packageQueryOnly: `!!${value}!to-string-loader?query-only`,
    packageFragmentOnly: `!!${value}!to-string-loader#fragment-only`,
    directoryResource: `!!${value}!./directory?directory#fragment`,
  }
  return `
    import relative from ${JSON.stringify(requests.relative)};
    import absolute from ${JSON.stringify(requests.absolute)};
    let optional;
    try { require("!!../loaders/missing.cjs!./input.requestgen") }
    catch { optional = "missing" }
    let unexportedLoader;
    try { require("!!inline-conditions-loader/private!./identity.js") }
    catch { unexportedLoader = "missing" }
    let jsonLoader;
    try { require("!!inline-main-loader/json-only!./identity.js") }
    catch { jsonLoader = "missing" }
    export default {
      relative, absolute, optional, unexportedLoader, jsonLoader,
      exportedResources: (() => {
        const results = {};
        ${Object.entries(exportedResources)
          .map(
            ([key, resource]) => `
            try {
              const value = require(${JSON.stringify(`!!${value}!${resource}`)});
              results[${JSON.stringify(key)}] = { query: value.resourceQuery, fragment: value.resourceFragment };
            } catch {
              results[${JSON.stringify(key)}] = 'missing';
            }
          `
          )
          .join('\n')}
        return results;
      })(),
      ${Object.entries(requests)
        .filter(([key]) => key !== 'relative' && key !== 'absolute')
        .map(([key, request]) => `${key}: require(${JSON.stringify(request)})`)
        .join(',\n')},
      resolved: typeof require.resolve(${JSON.stringify(requests.queryA)}),
      distinctQueryIds: require.resolve(${JSON.stringify(requests.queryA)}) !== require.resolve(${JSON.stringify(requests.queryB)}),
      distinctFragmentIds: require.resolve(${JSON.stringify(requests.fragmentA)}) !== require.resolve(${JSON.stringify(requests.fragmentB)}),
      distinctPrefixedModule: require("./identity.js") !== require("!!./identity.js"),
      distinctPackageQueryIds: require.resolve(${JSON.stringify(requests.packageQueryOnly)}) !== require.resolve(${JSON.stringify(`!!${value}!to-string-loader?other-query`)}),
      distinctPackageFragmentIds: require.resolve(${JSON.stringify(requests.packageFragmentOnly)}) !== require.resolve(${JSON.stringify(`!!${value}!to-string-loader#other-fragment`)}),
      packageSource: require("!!../loaders/text.cjs!to-string-loader").includes("module.exports.pitch"),
      packageQuery: (() => {
        const value = require("!!../loaders/value.cjs?label=package!to-string-loader?resource#fragment");
        return { options: value.options, query: value.resourceQuery, fragment: value.resourceFragment };
      })(),
      dynamic: () => import(${JSON.stringify(requests.relative)}).then(m => m.default),
    };
  `
}
