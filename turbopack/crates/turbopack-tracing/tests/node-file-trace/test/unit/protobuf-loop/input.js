'use strict'
const path = require('path')
// Load Google's well-known proto files that aren't exposed by Protobuf.js.
{
  // Protobuf.js exposes: any, duration, empty, field_mask, struct, timestamp,
  // and wrappers. compiler/plugin is excluded in Protobuf.js and here.
  var wellKnownProtos = ['asset1', 'asset2']
  var sourceDir = path.join(__dirname, 'assets')
  for (
    var _i = 0, wellKnownProtos_1 = wellKnownProtos;
    _i < wellKnownProtos_1.length;
    _i++
  ) {
    var proto = wellKnownProtos_1[_i]
    var file = path.join(sourceDir, proto + '.txt')
    var descriptor_1 = Protobuf.loadSync(file).toJSON()
    // @ts-ignore
    Protobuf.common(proto, descriptor_1.nested.google.nested)
  }
}
//# sourceMappingURL=index.js.map
