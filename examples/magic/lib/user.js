// import crypto from 'crypto'

/**
 * User methods. The example doesn't contain a DB, but for real applications you must use a
 * db here, such as MongoDB, Fauna, SQL, etc.
 */

export async function findUser({ email, issuer }) {
  // Here you should lookup for the user in your DB and compare the email:
  //
  // const user = await DB.findUser(...)

  return { email, issuer, createdAt: Date.now() }
}
