import { NextApiRequest, NextApiResponse } from "next";
import { serialize } from "cookie";
import { COOKIE_NAME } from "../../lib";

export default async function logout(_: NextApiRequest, res: NextApiResponse) {
  const cookie = serialize(COOKIE_NAME, "", { maxAge: -1, path: "/" });

  res.setHeader("Set-Cookie", cookie);
  res.redirect("/");
}
