import { EXPORT, EXPORT2, EXPORT3, EXPORT4, EXPORT5, EXPORT6 } from './inner'

export function f1() {
  // no using EXPORT
}

export function f2() {
  return EXPORT
}

function f3() {
  return EXPORT
}

const f4 = function () {
  return EXPORT
}

const f5 = () => {
  return EXPORT
}

let f6 = () => {
  return EXPORT
}

const f7 = () => {
  return EXPORT5()
}

const f8 = () => {
  return EXPORT6()
}

export function g2() {
  return f2()
}

export function g3() {
  return f3()
}

export var g4 = () => f4()

export let g5 = () => {
  return f5()
}

function ga6() {
  return f6() || gb6()
}

function gb6() {
  return ga6()
}

export class g7 {
  static f() {
    return EXPORT
  }
}

export const pure1 = EXPORT
export const pure2 = /*#__PURE__*/ f6()
const pure3 = /*#__PURE__*/ g5()
const pure4 = /*#__PURE__*/ f7(f8())
const pure5 =
  ('fefef', 1123, /*#__PURE__*/ f2('fwefe'), /*#__PURE__*/ f2('efwefa'))
const pure6 = /*#__PURE__*/ f2(/*#__PURE__*/ f2(), /*#__PURE__*/ f2())
const pure7 = /*#__PURE__*/ f2(
  class {
    f() {
      return EXPORT
    }
  }
)
const pure8 = /*#__PURE__*/ f2(() => EXPORT)
export const pureUsed = EXPORT3

function x1() {
  return EXPORT2
}

const x2 = function x2() {
  return x1()
}

const x3 = () => {
  return x2()
}

const x4 = x3()

export function fWithDefault(r = EXPORT4) {
  return r
}

export default (function () {
  return EXPORT
})
