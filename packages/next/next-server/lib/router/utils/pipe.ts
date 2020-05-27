export const pipe = <R>(...fns: Array<(a: R) => R>) => (param: R) =>
  fns.reduce((result: R, next) => next(result), param)
