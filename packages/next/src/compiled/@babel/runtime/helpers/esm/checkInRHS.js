import _typeof from "./typeof.js";
export default function _checkInRHS(value) {
  if (Object(value) !== value) throw TypeError("right-hand side of 'in' should be an object, got " + (null !== value ? _typeof(value) : "null"));
  return value;
}