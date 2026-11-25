import * as root from 'next/root-params'

export async function readNamespace(name: 'lang' | 'countryCode') {
  'use cache'
  return root[name]()
}
