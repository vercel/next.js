import {
  A,
  B,
  getC,
  getD,
  getE,
  getF,
  Foo,
  Pure,
  DateFormatter,
  ConditionalExpression,
  LogicalExpression,
} from './dep2?decl'
import {
  A3,
  B3,
  C3,
  D3,
  E3,
  F3,
  Pure3,
  ConditionalExpression3,
  LogicalExpression3,
} from './dep3?decl'

export class A1 extends A {
  render() {
    return new A2()
  }
}

export class B1 extends B {
  render() {
    return new B2()
  }
}

// prettier-ignore
export class C1 extends /*#__PURE__*/ getC() {
	render() {
		return new C2();
	}
}

// prettier-ignore
export class D1 extends /*@__PURE__*/ getD() {
	render() {
		return new D2();
	}
}

export class E1 extends getE() {
  render() {
    return new E2()
  }
}

export class F1 extends getF() {
  render() {
    return new F2()
  }
}

function foo(instance) {
  return new instance()
}

class Bar extends Foo {
  static prop = 42
  static a = foo(this).prop
  static b = foo(Bar).prop
  static c = foo(super.Bar).prop
  static inStatic1
  static inStatic2
  static inStatic3
  static {
    this.inStatic1 = new Bar().prop
    this.inStatic2 = new super.Bar().prop
    this.inStatic3 = new this().prop
  }
}

class BarA extends Foo {
  static prop = 42
  static a = foo(this).prop
}

class BarB extends Foo {
  static prop = 42
  static b = foo(Bar).prop
}

class BarC extends Foo {
  static prop = 42
  static c = foo(super.Bar).prop
}

class BarPA extends Foo {
  static prop = 42
  static #a = foo(this).prop
}

class BarPB extends Foo {
  static prop = 42
  static #b = foo(Bar).prop
}

class BarPC extends Foo {
  static prop = 42
  static #c = foo(super.Bar).prop
}

const ExpressionFoo = class Bar extends Foo {
  static prop = 42
  static a = foo(this).prop
  static b = foo(Bar).prop
  static c = foo(super.Bar).prop
  static inStatic1
  static inStatic2
  static inStatic3
  static {
    this.inStatic1 = new Bar().prop
    this.inStatic2 = new super.Bar().prop
    this.inStatic3 = new this().prop
  }
}

export class Baz extends Foo {
  static prop = 42
  static a = foo(this).prop
  static b = foo(Bar).prop
  static c = foo(super.Bar).prop
  static inStatic1
  static inStatic2
  static inStatic3
  static {
    this.inStatic1 = new Bar().prop
    this.inStatic2 = new super.Bar().prop
    this.inStatic3 = new this().prop
  }
}

export default class DefaultBar extends Foo {
  static prop = 42
  static a = foo(this).prop
  static b = foo(Bar).prop
  static c = foo(super.Bar).prop
  static inStatic1
  static inStatic2
  static inStatic3
  static {
    this.inStatic1 = new Bar().prop
    this.inStatic2 = new super.Bar().prop
    this.inStatic3 = new this().prop
  }
}

export class ExtendsPure extends Pure {
  render() {
    return new Pure3()
  }
}

export class DateBar extends DateFormatter {
  constructor() {
    super()
  }
  render() {}
}

export class ConditionalExpression1 extends ConditionalExpression {
  render() {
    return new ConditionalExpression3()
  }
}

export class LogicalExpression1 extends LogicalExpression {
  render() {
    return new LogicalExpression3()
  }
}

export class A2 extends A3 {}
export class B2 extends B3 {}
export class C2 extends C3 {}
export class D2 extends D3 {}
export class E2 extends E3 {}
export class F2 extends F3 {}
