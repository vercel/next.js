let shouldBeKept = 'should be kept'
export async function keep() {
  console.log(shouldBeKept)
}

let shouldBeRemoved = 'should be removed'
export function removeFunction() {
  console.log(shouldBeRemoved)
}

export let removeVarDeclaration = 'should be removed'
export let removeVarDeclarationUndefined // should also be removed
export let multipleDecl = 'should be removed',
  keep1 = 'should be kept'
export let keep2 = 'should be kept'

export class RemoveClass {
  remove() {
    console.log('should be removed')
  }
}

let x = 'x'
let y = 'y'

// This should be removed
export { x, y as z }

let keep3 = 'should be kept'
let asKeep = 'should be kept'
let removeNamed = 'should be removed'

export { keep3, asKeep as keep4, removeNamed }

export default function removeDefault() {
  console.log('should be removed')
}

function ShouldBeKept() {
  return 'should be kept'
}
let shouldBeKept2 = 'should be kept'

export function keep5() {
  return <ShouldBeKept val={shouldBeKept2} />
}
