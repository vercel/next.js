export default async function getUser(token) {
  const response = await fetch(
    `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/userinfo`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )
  return await response.json()
}
