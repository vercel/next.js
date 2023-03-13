export default async function handler() {
  return new Response('[id]')
}

export const config = {
  runtime: 'edge',
}
