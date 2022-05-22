import classApplyDescriptorSet from "./classApplyDescriptorSet.js";
import classExtractFieldDescriptor from "./classExtractFieldDescriptor.js";
export default function _classPrivateFieldSet(receiver, privateMap, value) {
  var descriptor = classExtractFieldDescriptor(receiver, privateMap, "set");
  classApplyDescriptorSet(receiver, descriptor, value);
  return value;
}