export async function logic() {
  'use cache'

  return `${process.env.MY_DEPLOYMENT_ID}`
}
