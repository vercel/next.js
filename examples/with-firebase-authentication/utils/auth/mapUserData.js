export const mapUserData = (user) => {
  const { uid, email, xa, ya } = user
  return {
    id: uid,
    email,
    token: xa || ya,
  }
}
