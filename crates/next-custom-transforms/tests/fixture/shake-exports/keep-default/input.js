let shouldBeRemoved = 'should be removed'
export function removeFunction() {
  console.log(shouldBeRemoved)
}

let usedByShouldBeKept = 'should be kept'
export default function shouldBeKept() {
  console.log(usedByShouldBeKept)
}
