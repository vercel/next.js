export default function _defineAccessor(type, obj, key, fn) {
  var desc = {
    configurable: !0,
    enumerable: !0
  };
  return desc[type] = fn, Object.defineProperty(obj, key, desc);
}