export const mapUserData = async (user) => {
  const { uid, email } = user
  const token = await user.getIdToken()
  return {
    id: uid,
    email,
    token,
  }
}
