import { headers } from 'next/headers'

export const generateMetadata = async function() {
  await headers()
}
