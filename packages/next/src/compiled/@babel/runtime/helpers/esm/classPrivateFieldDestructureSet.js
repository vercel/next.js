import classApplyDescriptorDestructureSet from "./classApplyDescriptorDestructureSet.js";
import classExtractFieldDescriptor from "./classExtractFieldDescriptor.js";
export default function _classPrivateFieldDestructureSet(receiver, privateMap) {
  var descriptor = classExtractFieldDescriptor(receiver, privateMap, "set");
  return classApplyDescriptorDestructureSet(receiver, descriptor);
}