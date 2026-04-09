import {
  calledA1,
  calledB1,
  calledC1,
  calledC2,
  unreachableA1,
  unreachableA2,
  unreachableA3,
  unreachableB1,
  unreachableB2,
  unreachableC1,
} from 'foo'

function A() {
  calledA1()
  while (true) {
    return
    unreachableA1()
    break
    unreachableA2()
  }
  unreachableA3()
}
function B() {
  while (true) {
    break
    unreachableB1()
    return
    unreachableB2()
  }
  calledB1()
}
function C(v) {
  while (true) {
    if (v) {
      break
    }
    calledC1()
    return
    unreachableC1()
  }
  calledC2()
}
