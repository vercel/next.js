import { fetcher } from '../../src/fetcher'

export const config = { runtime: 'edge' }

export default async function UnknownDomainEndpoint() {
  await fetcher('http://an.unknown.domain.nextjs')
}
