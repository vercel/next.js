import { headers } from 'next/headers'
import { after } from 'next/server'
import { redirect, permanentRedirect } from 'next/navigation'
import Page from '../../ancestor/[...slug]/page'
import { completedRequests } from './state'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function RedirectPage(props) {
  const query = await props.searchParams
  const request = (await headers()).get('x-route-request')
  after(async () => {
    await Promise.resolve()
    completedRequests.push(request)
    console.log('ROUTE_REDIRECT_AFTER ' + request)
  })
  if (query.redirect === 'temporary')
    redirect('/acme/redirect/target?from=temporary')
  if (query.redirect === 'permanent')
    permanentRedirect('/acme/redirect/target?from=permanent')
  return <Page {...props} />
}
