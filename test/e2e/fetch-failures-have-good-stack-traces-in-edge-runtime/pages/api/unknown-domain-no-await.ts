export const config = { runtime: 'edge' }

export default async function UnknownDomainEndpoint() {
  fetch('http://an.unknown.domain.nextjs').catch((reason) => {
    console.error(reason)
  })

  return new Response('okay.')
}
