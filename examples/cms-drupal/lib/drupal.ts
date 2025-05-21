import { NextDrupal } from "next-drupal";

export const drupal = new NextDrupal(process.env.NEXT_PUBLIC_DRUPAL_BASE_URL!, {
  auth: {
    clientId: process.env.DRUPAL_CLIENT_ID!,
    clientSecret: process.env.DRUPAL_CLIENT_SECRET!,
  },
});
