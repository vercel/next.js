import { BaseError, BaseError1, BaseError2, BaseError3 } from './dep2'

export class ExtendedError extends BaseError {
  constructor(message) {
    super(message)
  }
}
export class ExtendedError1 extends BaseError1 {
  constructor(message) {
    super(message)
  }
}
export class ExtendedError2 extends BaseError2 {
  myMethod() {}
}
export class ExtendedError3 extends BaseError3 {}
export class ExtendedError4 extends Error {
  constructor(message = 'ExtendedError') {
    super(message)
  }
}
