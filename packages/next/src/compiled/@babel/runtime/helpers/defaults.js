function _defaults(e, r) {
  for (var t = Object.getOwnPropertyNames(r), o = 0; o < t.length; o++) {
    var n = t[o],
      a = Object.getOwnPropertyDescriptor(r, n);
    a && a.configurable && void 0 === e[n] && Object.defineProperty(e, n, a);
  }
  return e;
}
module.exports = _defaults, module.exports.__esModule = true, module.exports["default"] = module.exports;