import { handler } from '../../../respond'

export const unstable_paramMatching = { __metadata_id__: 'not-found' }

export function generateStaticParams() {
  return [{ __metadata_id__: 'allowed' }]
}

export const GET = handler('GET')
