function isEqualLocals(a: any, b: any, isNamedExport: any) {
  if ((!a && b) || (a && !b)) {
    return false
  }

  let p

  for (p in a) {
    if (isNamedExport && p === 'default') {
      continue
    }

    if (a[p] !== b[p]) {
      return false
    }
  }

  for (p in b) {
    if (isNamedExport && p === 'default') {
      continue
    }

    if (!a[p]) {
      return false
    }
  }

  return true
}

module.exports = isEqualLocals
