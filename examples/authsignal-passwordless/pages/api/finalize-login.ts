import { Authsignal } from "@authsignal/node";
import { NextApiRequest, NextApiResponse } from "next";
import { createCookieForSession } from "../../lib";

const authsignal = new Authsignal({ secret: process.env.AUTHSIGNAL_SECRET! });

export default async function finalizeLogin(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const token = req.query.token as string;

  const { success, user } = await authsignal.validateChallenge({ token });

  if (success) {
    const cookie = await createCookieForSession(user);

    res.setHeader("Set-Cookie", cookie);
  }

  res.redirect("/");
}
