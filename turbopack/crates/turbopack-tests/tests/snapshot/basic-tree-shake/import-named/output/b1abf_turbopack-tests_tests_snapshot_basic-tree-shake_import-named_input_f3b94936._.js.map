{
  "version": 3,
  "sources": [],
  "sections": [
    {"offset": {"line": 6, "column": 0}, "map": {"version":3,"sources":[],"names":[],"mappings":""}},
    {"offset": {"line": 12, "column": 0}, "map": {"version":3,"sources":["turbopack:///[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic-tree-shake/import-named/input/lib.js"],"sourcesContent":["let dog = \"dog\";\n\ndog += \"!\";\n\nconsole.log(dog);\n\nfunction getDog() {\n  return dog;\n}\n\ndog += \"!\";\n\nconsole.log(dog);\n\nfunction setDog(newDog) {\n  dog = newDog;\n}\n\ndog += \"!\";\n\nconsole.log(dog);\n\nexport const dogRef = {\n  initial: dog,\n  get: getDog,\n  set: setDog,\n};\n\nexport let cat = \"cat\";\n\nexport const initialCat = cat;\n\nexport function getChimera() {\n  return cat + dog;\n}\n"],"names":[],"mappings":";;;;;;AA4BO,IAAI,MAAM"}},
    {"offset": {"line": 26, "column": 0}, "map": {"version":3,"sources":[],"names":[],"mappings":""}},
    {"offset": {"line": 38, "column": 0}, "map": {"version":3,"sources":["turbopack:///[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic-tree-shake/import-named/input/index.js"],"sourcesContent":["import {cat as c} from './lib'\n\nconsole.log(c)\n"],"names":[],"mappings":";AAAA;AAAA;;AAEA,QAAQ,GAAG,CAAC,gPAAA,CAAA,MAAC"}}]
}