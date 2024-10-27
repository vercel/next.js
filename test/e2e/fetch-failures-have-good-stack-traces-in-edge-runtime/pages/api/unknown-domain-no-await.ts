export const config = { runtime: 'edge' }

export default async function UnknownDomainEndpoint() {
  fetch('http://an.unknown.domain.nextjs').catch((err) => {
    console.error(`stack is:`, err.stack)
  })

  return new Response('okay.')
}
