export default function _iterableToArrayLimitLoose(arr, i) {
  var _i = arr && ("undefined" != typeof Symbol && arr[Symbol.iterator] || arr["@@iterator"]);
  if (null != _i) {
    var _s,
      _arr = [];
    for (_i = _i.call(arr); arr.length < i && !(_s = _i.next()).done;) _arr.push(_s.value);
    return _arr;
  }
}