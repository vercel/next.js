import { Review } from '#/app/api/reviews/review'

const reviews: Review[] = [
  {
    id: '1',
    name: 'Nullam Duis',
    rating: 4,
    text: 'Phasellus efficitur, nisi ut varius ultricies, tortor arcu ullamcorper nisi, eu auctor enim est ut enim. Sed fringilla, nulla ut tincidunt hendrerit, risus tortor laoreet tortor, non mattis arcu elit vel ante.',
  },
  {
    id: '2',
    name: 'Donec Nulla Velit',
    rating: 1,
    text: 'Nullam fermentum nisl non mattis fringilla!!!!',
  },
  {
    id: '3',
    name: 'J Tempus',
    rating: 3,
    text: 'Pellentesque faucibus quam eu vehicula pulvinar. Integer cursus fringilla metus.',
  },
]

export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // We sometimes artificially delay a reponse for demo purposes.
  // Don't do this in real life :)
  const delay = searchParams.get('delay')
  if (delay) {
    await new Promise((resolve) => setTimeout(resolve, Number(delay)))
  }

  return new Response(JSON.stringify(reviews), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  })
}
