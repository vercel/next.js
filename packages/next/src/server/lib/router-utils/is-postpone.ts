const REACT_POSTPONE_TYPE: symbol = Symbol.for('react.postpone')

export function isPostpone(error: any): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    error.$$typeof === REACT_POSTPONE_TYPE
  )
}
