import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'

it.each(['actual', 'missing-race', 'accessor-race'])(
  'retains actual native race capability allocation and fallback effects for %s',
  (profile) => {
    const output = execFileSync(
      process.execPath,
      [
        join(__dirname, 'race-capability.cjs'),
        dirname(require.resolve('next/package.json')),
        profile,
      ],
      { encoding: 'utf8', timeout: 10000 }
    )
    expect(JSON.parse(output)).toEqual({
      mode: profile,
      cases: 8,
      sameActualNativeAllocations: true,
      actualResolverGetterReceiverIteratorAndErrors: true,
      exoticConstructorAndCalleeOrderPreserved: true,
      noProvidedObjectReceipt: true,
      optionalIntrinsicAccessorUnread: true,
    })
  }
)
