import { DynamicComponent } from '../client-reference'

export async function GET() {
  return new Response('Hello ' + typeof DynamicComponent)
}
