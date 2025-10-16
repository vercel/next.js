import imported from '../../../public/vercel.png'
const url = new URL('../../../public/vercel.png', import.meta.url)

export default (req, res) => {
  return new Response(
    JSON.stringify({
      imported,
      url: url.toString(),
    })
  )
}

export const runtime = 'experimental-edge'
