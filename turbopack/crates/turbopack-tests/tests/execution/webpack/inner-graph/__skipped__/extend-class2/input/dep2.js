export class A {}
export class B {}
export const getC = () => class C {}
export const getD = () => class D {}
export const getE = () => class E {}
export const getF = () => class F {}
export class Foo {
  static Bar = Foo
}
export class Pure {}
export class DateFormatter extends Date {
  constructor() {
    super()
    this.date = this.getDate()
  }
}
export class ConditionalExpression extends (true ? A : B) {}
export class LogicalExpression extends (A || B) {}

export const exportsInfoForA = __webpack_exports_info__.A.used
export const exportsInfoForB = __webpack_exports_info__.B.used
export const exportsInfoForC = __webpack_exports_info__.getC.used
export const exportsInfoForD = __webpack_exports_info__.getD.used
export const exportsInfoForE = __webpack_exports_info__.getE.used
export const exportsInfoForF = __webpack_exports_info__.getF.used
export const exportsInfoForFoo = __webpack_exports_info__.Foo.used
export const exportsInfoForPure = __webpack_exports_info__.Pure.used
export const exportsInfoForDateFormatter =
  __webpack_exports_info__.DateFormatter.used
export const exportsInfoForConditionalExpression =
  __webpack_exports_info__.ConditionalExpression.used
export const exportsInfoForLogicalExpression =
  __webpack_exports_info__.LogicalExpression.used
