export const RuntimeErrorHandler = {
  hadRuntimeError:
    typeof document !== 'undefined' &&
    document.documentElement.id === '__next_error__',
}
