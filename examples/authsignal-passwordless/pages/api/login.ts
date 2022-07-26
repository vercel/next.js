import { Authsignal } from "@authsignal/node";
import { NextApiRequest, NextApiResponse } from "next";

const authsignal = new Authsignal({ secret: process.env.AUTHSIGNAL_SECRET! });

export default async function login(req: NextApiRequest, res: NextApiResponse) {
  const { email } = req.body;

  const { url } = await authsignal.loginWithEmail({ email, redirectUrl });

  res.redirect(303, url);
}

const redirectUrl =
  process.env.REDIRECT_URL ?? "http://localhost:3000/api/finalize-login";
