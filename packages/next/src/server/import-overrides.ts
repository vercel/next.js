const { dirname } = require('path') as typeof import('path')

let resolve: typeof require.resolve = process.env.NEXT_MINIMAL
  ? // @ts-ignore
    __non_webpack_require__.resolve
  : require.resolve

let nextPaths: undefined | { paths: string[] | undefined } = undefined

if (!process.env.NEXT_MINIMAL) {
  nextPaths = {
    paths: resolve.paths('next/package.json') || undefined,
  }
}
export const hookPropertyMap = new Map()

export const defaultOverrides = {
  'styled-jsx': process.env.NEXT_MINIMAL
    ? dirname(resolve('styled-jsx/package.json'))
    : dirname(resolve('styled-jsx/package.json', nextPaths)),
  'styled-jsx/style': process.env.NEXT_MINIMAL
    ? resolve('styled-jsx/style')
    : resolve('styled-jsx/style', nextPaths),
}

const toResolveMap = (map: Record<string, string>): [string, string][] =>
  Object.entries(map).map(([key, value]) => [key, resolve(value, nextPaths)])

export function addHookAliases(aliases: [string, string][] = []) {
  for (const [key, value] of aliases) {
    hookPropertyMap.set(key, value)
  }
}

addHookAliases(toResolveMap(defaultOverrides))
