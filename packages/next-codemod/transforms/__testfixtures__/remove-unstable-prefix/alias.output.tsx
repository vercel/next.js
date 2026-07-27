// @ts-nocheck
import { cacheTag as cacheTagImport, cacheLife as cacheLifeImport } from 'next/cache'
const { cacheTag: cacheTagRequire, cacheLife: cacheLifeRequire } = require('next/cache')
// Alias with same API name, alias should be removed.
import { cacheTag, cacheLife } from 'next/cache'
const { cacheTag, cacheLife } = require('next/cache')

export function MyComponent() {
  const cacheTagImportTag = cacheTagImport('foo')
  const cacheLifeImportLife = cacheLifeImport('1 hour')
  const cacheTagRequireTag = cacheTagRequire('bar')
  const cacheLifeRequireLife = cacheLifeRequire('2 hours')
  const cacheTagAlias = cacheTag('redundant')
  const cacheLifeAlias = cacheLife('redundant-time')

  return (
    <div>
      <p>Using cache tag: {cacheTagImportTag}</p>
      <p>Using cache life: {cacheLifeImportLife}</p>
      <p>Using another tag: {cacheTagRequireTag}</p>
      <p>Using another life: {cacheLifeRequireLife}</p>
      <p>Using same alias tag: {cacheTagAlias}</p>
      <p>Using same alias life: {cacheLifeAlias}</p>
    </div>
  )
}