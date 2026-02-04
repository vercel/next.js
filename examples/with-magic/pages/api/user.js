import { getLoginSession } from "../../lib/auth";

export default async function user(req, res) {
  const session = await getLoginSession(req);
  // After getting the session you may want to fetch for the user instead
  // of sending the session's payload directly, this example doesn't have a DB
  // so it won't matter in this case
  res.status(200).json({ user: session || null });
}
