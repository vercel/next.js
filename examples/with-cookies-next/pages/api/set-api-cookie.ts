import { setCookie } from "cookies-next";

export default async function setApiCookie(req, res) {
  try {
    setCookie("api-cookie", "mock-value", { req, res, maxAge: 60 * 60 * 24 });
    res.status(200).send("set api cookies");
  } catch (error) {
    res.status(400).send(error.message);
  }
}
