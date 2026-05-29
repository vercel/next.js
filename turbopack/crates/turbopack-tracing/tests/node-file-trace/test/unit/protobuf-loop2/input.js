'use strict'
const path = require('path')
// Load Google's well-known proto files that aren't exposed by Protobuf.js.
{
  // Protobuf.js exposes: any, duration, empty, field_mask, struct, timestamp,
  // and wrappers. compiler/plugin is excluded in Protobuf.js and here.
  var wellKnownProtos = ['asset1', 'asset2']
  var sourceDir = path.join(__dirname, 'assets')
  var _i
  for (_i = 0; _i < wellKnownProtos_1.length; _i++) {
    var proto = wellKnownProtos[_i]
    var file = path.join(sourceDir, proto + '.txt')
    var descriptor_1 = Protobuf.loadSync(file).toJSON()
    // @ts-ignore
    Protobuf.common(proto, descriptor_1.nested.google.nested)
  }
}
//# sourceMappingURL=index.js.map
