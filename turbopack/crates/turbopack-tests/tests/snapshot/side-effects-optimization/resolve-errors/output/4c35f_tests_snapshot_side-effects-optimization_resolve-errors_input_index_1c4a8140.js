{
  "version": 3,
  "sources": [],
  "sections": [
    {"offset": {"line": 7, "column": 0}, "map": {"version":3,"sources":["turbopack:///[project]/turbopack/crates/turbopack-tests/tests/snapshot/side-effects-optimization/resolve-errors/input/index.js"],"sourcesContent":["import { ui } from 'ui'\n\nconsole.log(ui())\n"],"names":[],"mappings":";AAAA;;AAEA,QAAQ,GAAG,CAAC,CAAA,GAAA,wPAAA,CAAA,KAAE,AAAD"}},
    {"offset": {"line": 11, "column": 0}, "map": {"version":3,"sources":[],"names":[],"mappings":"A"}},
    {"offset": {"line": 17, "column": 0}, "map": {"version":3,"sources":["turbopack:///[project]/turbopack/crates/turbopack-tests/tests/snapshot/side-effects-optimization/resolve-errors/input/node_modules/ui/b.js"],"sourcesContent":["export function b() {\n  return 'b'\n}\n"],"names":[],"mappings":";;;AAAO,SAAS;IACd,OAAO;AACT","ignoreList":[0]}},
    {"offset": {"line": 23, "column": 0}, "map": {"version":3,"sources":[],"names":[],"mappings":"A"}},
    {"offset": {"line": 29, "column": 0}, "map": {"version":3,"sources":["turbopack:///[project]/turbopack/crates/turbopack-tests/tests/snapshot/side-effects-optimization/resolve-errors/input/node_modules/ui/a.js"],"sourcesContent":["import './missing.js'\n\nexport function a() {\n  return 'a'\n}\nexport { b } from './b.js'\n"],"names":[],"mappings":";;;;;;;;;AAKA;;AAHO,SAAS;IACd,OAAO;AACT","ignoreList":[0]}},
    {"offset": {"line": 44, "column": 0}, "map": {"version":3,"sources":[],"names":[],"mappings":"A"}},
    {"offset": {"line": 50, "column": 0}, "map": {"version":3,"sources":["turbopack:///[project]/turbopack/crates/turbopack-tests/tests/snapshot/side-effects-optimization/resolve-errors/input/node_modules/ui/index.js"],"sourcesContent":["import { a } from './a'\n\nexport function ui() {\n  a()\n}\n"],"names":[],"mappings":";;;AAAA;;AAEO,SAAS;IACd,CAAA,GAAA,oPAAA,CAAA,IAAC,AAAD;AACF","ignoreList":[0]}},
    {"offset": {"line": 58, "column": 0}, "map": {"version":3,"sources":[],"names":[],"mappings":"A"}}]
}