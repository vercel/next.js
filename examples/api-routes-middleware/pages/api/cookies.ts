import type { NextApiRequest, NextApiResponse } from "next";
import { setCookie } from "../../utils/cookies";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  // Calling our pure function using the `res` object, it will add the `set-cookie` header
  setCookie(res, "Next.js", "api-middleware!");
  // Return the `set-cookie` header so we can display it in the browser and show that it works!
  res.end(res.getHeader("Set-Cookie"));
}
