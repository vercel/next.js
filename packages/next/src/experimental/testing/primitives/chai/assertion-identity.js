const assertionIdentities = new WeakMap()
const readIdentity = WeakMap.prototype.get.bind(assertionIdentities)
const writeIdentity = WeakMap.prototype.set.bind(assertionIdentities)
const freezeIdentity = Object.freeze
const transferSources = new WeakMap()
const readTransferSource = WeakMap.prototype.get.bind(transferSources)
const writeTransferSource = WeakMap.prototype.set.bind(transferSources)
const taskTransfers = new WeakSet()
const hasTaskTransfer = WeakSet.prototype.has.bind(taskTransfers)
const addTaskTransfer = WeakSet.prototype.add.bind(taskTransfers)

export function getChaiAssertionIdentity(value) {
  return readIdentity(value)
}

export function getChaiAssertionTransferSourceIdentity(value) {
  return readTransferSource(readIdentity(value) || value)
}

export function hasChaiAssertionTaskFlagTransfer(value) {
  return hasTaskTransfer(readIdentity(value) || value)
}

export function createAssertionIdentity() {
  const identity = { __proto__: null }
  freezeIdentity(identity)
  return identity
}

export function registerAssertionIdentity(value, identity) {
  writeIdentity(value, identity)
}

export function inheritAssertionIdentity(source, target) {
  const identity = readIdentity(source)
  if (identity) writeIdentity(target, identity)
}

export function markAssertionTaskTransfer(value) {
  const identity = readIdentity(value)
  if (identity) addTaskTransfer(identity)
}

export function recordAssertionTransfer(source, target) {
  const sourceIdentity = readIdentity(source)
  const targetIdentity = readIdentity(target)
  if (
    sourceIdentity &&
    targetIdentity &&
    sourceIdentity !== targetIdentity &&
    !readTransferSource(targetIdentity)
  ) {
    writeTransferSource(targetIdentity, sourceIdentity)
  }
}
