/*
MIT License

Copyright (c) 2018-2022, React Training LLC

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// This file is based on https://github.com/reach/reach-ui/blob/v0.18.0/packages/utils/src/context.tsx
// It's been edited for the needs of this project
// See the LICENSE at the top of the file

import * as React from 'react'

type ContextProvider<T> = React.FC<React.PropsWithChildren<T>>

export function createContext<ContextValueType extends object | null>(
  rootComponentName: string,
  defaultContext?: ContextValueType
): [
  ContextProvider<ContextValueType>,
  (callerComponentName: string) => ContextValueType
] {
  const Ctx = React.createContext<ContextValueType | undefined>(defaultContext)

  function Provider(props: React.PropsWithChildren<ContextValueType>) {
    const { children, ...context } = props
    const value = React.useMemo(
      () => context,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      Object.values(context)
    ) as ContextValueType
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
  }

  function useContext(callerComponentName: string) {
    const context = React.useContext(Ctx)
    if (context) {
      return context
    }
    if (defaultContext) {
      return defaultContext
    }
    throw Error(
      `${callerComponentName} must be rendered inside of a ${rootComponentName} component.`
    )
  }

  Ctx.displayName = `${rootComponentName}Context`
  Provider.displayName = `${rootComponentName}Provider`
  return [Provider, useContext]
}
