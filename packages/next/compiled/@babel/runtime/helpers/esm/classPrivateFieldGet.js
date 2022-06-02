import classApplyDescriptorGet from "./classApplyDescriptorGet.js";
import classExtractFieldDescriptor from "./classExtractFieldDescriptor.js";
export default function _classPrivateFieldGet(receiver, privateMap) {
  var descriptor = classExtractFieldDescriptor(receiver, privateMap, "get");
  return classApplyDescriptorGet(receiver, descriptor);
}