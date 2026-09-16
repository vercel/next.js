// An arrow has no `this` of its own, so calling it through the namespace does not need the
// namespace as a receiver.
export const arrowFn = (x) => x * 2

// A function declaration that never reaches `this` is equally safe.
export function plainFn(x) {
  return x + 1
}

// This one observes `this`, so the namespace has to stay the receiver.
export function methodLike() {
  return this === undefined ? 'no-this' : 'has-this'
}

// A direct `eval` can read `this` without it appearing in the source, so the namespace has to
// stay the receiver.
export function evalFn() {
  return eval('this')
}

// Every `this` here binds to the class body -- method, field initializer and static block --
// so the enclosing function never observes a receiver of its own.
export function classFn() {
  class Inner {
    field = this
    static {
      this.tag = 'tag'
    }
    m() {
      return this.x
    }
  }
  return Inner
}
