import { theme } from '../../../../variants'

export function unstable_generateStaticVariants() {
  return [[[theme, 'dark']]]
}

export function GET() {
  return new Response('route')
}
