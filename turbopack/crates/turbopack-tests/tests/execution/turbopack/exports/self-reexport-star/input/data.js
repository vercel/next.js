import * as Self from './data'

export function foo() {
  return 'foo'
}

export function bar() {
  return 'bar'
}

// Call exports through the module's own namespace object.
export function fooViaSelf() {
  return Self.foo()
}

export function barViaSelf() {
  return Self.bar()
}

// Access the re-exported self-namespace via the self-namespace itself.
export function nestedSelfFoo() {
  return Self.Data.foo()
}

export * as Data from './data'
