import { createClient } from "nhost-js-sdk";

export const nhost = createClient({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
});
