// DO NOT MODIFY THIS FILE DIRECTLY
// It's for aliasing the `semver` package to be a noop for the `jsonwebtoken` package.
// We're trying to minimize the size of the worker bundle.

export function satisfies() {
  return true
}
