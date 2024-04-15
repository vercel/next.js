import { createClient } from "urql";

export const client = createClient({
  url: "https://graphql-pokemon2.vercel.app/",
});
