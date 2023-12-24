import React from 'react'

export function serverGetterInClientComponentError(
  getterName: string
): void | never {
  if (process.env.NODE_ENV !== 'production') {
    // If useState is defined we're in a client component
    if (Boolean(React.useState)) {
      throw new Error(`${getterName} only works in Server Components`)
    }
  }
}
