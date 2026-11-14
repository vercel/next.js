export async function logic() {
  'use cache'

  return `${process.env.NEXT_DEPLOYMENT_ID}`
}
