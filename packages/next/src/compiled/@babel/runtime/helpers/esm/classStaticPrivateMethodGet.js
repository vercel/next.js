import classCheckPrivateStaticAccess from "./classCheckPrivateStaticAccess.js";
export default function _classStaticPrivateMethodGet(receiver, classConstructor, method) {
  classCheckPrivateStaticAccess(receiver, classConstructor);
  return method;
}