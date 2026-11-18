export const config = { runtime: 'edge', maxDuration: 20 }
export const runtime = undefined
export const maxDuration = undefined

export default function handler() {
  return Response.json({ runtime: process.env.NEXT_RUNTIME })
}
