export function getAllUsers(req) {
  // For demo purpose only. You are not likely to have to return all users.
  return req.session.users
}

export function createUser(req, user) {
  // Here you should insert the user into the database
  // await db.createUser(user)
  req.session.users.push(user)
}

export function findUserByUsername(req, username) {
  // Here you find the user based on id/username in the database
  // const user = await db.findUserById(id)
  return req.session.users.find((user) => user.username === username)
}

export function updateUserByUsername(req, username, update) {
  // Here you update the user based on id/username in the database
  // const user = await db.updateUserById(id, update)
  const user = req.session.users.find((u) => u.username === username)
  Object.assign(user, update)
  return user
}

export function deleteUser(req, username) {
  // Here you should delete the user in the database
  // await db.deleteUser(req.user)
  req.session.users = req.session.users.filter(
    (user) => user.username !== req.user.username
  )
}
