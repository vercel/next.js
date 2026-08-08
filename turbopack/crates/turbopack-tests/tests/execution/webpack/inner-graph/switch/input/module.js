import { Block, Inline, Document } from './some-module'

function getType(obj) {
  return obj.type
}

// Local functions
function doSomethingWithBlock(obj) {
  return Block.doSomething(obj)
}

function doSomethingWithInline(obj) {
  return Inline.doSomething(obj)
}

function doSomethingWithDocument(obj) {
  return Document.doSomething(obj)
}

// Exported functions
function doSomething(obj) {
  const type = getType(obj)

  switch (type) {
    case 'document':
      return doSomethingWithDocument(obj)
    case 'block':
      return doSomethingWithBlock(obj)
    case 'inline':
      return doSomethingWithInline(obj)
    default:
      throw new Error()
  }
}

function useDocument(obj) {
  return doSomethingWithDocument(obj)
}

export { useDocument }
export default doSomething
