import _typeof from "./typeof.js";
export default function _using(stack, value, isAwait) {
  if (null == value) return value;
  if ("object" != _typeof(value)) throw new TypeError("using decarations can only be used with objects, null, or undefined.");
  if (isAwait) var dispose = value[Symbol.asyncDispose || Symbol["for"]("Symbol.asyncDispose")];
  if (null == dispose && (dispose = value[Symbol.dispose || Symbol["for"]("Symbol.dispose")]), "function" != typeof dispose) throw new TypeError("Property [Symbol.dispose] is not a function.");
  return stack.push({
    v: value,
    d: dispose,
    a: isAwait
  }), value;
}