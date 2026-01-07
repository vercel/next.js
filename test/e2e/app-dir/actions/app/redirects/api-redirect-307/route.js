export function POST(request) {
  return Response.redirect(
    `${request.nextUrl.origin}/redirects?success=true`,
    307
  )
}
