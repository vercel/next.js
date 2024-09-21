"use server";

import { headers } from "next/headers";

export async function useHostname() {
  const headersList = headers();
  const hostname = headersList.get("x-forwarded-host");
  return hostname;
}

// export function useClientIP() {
//   const FALLBACK_IP_ADDRESS = "0.0.0.0";
//   const forwardedFor = headers().get("x-forwarded-for");

//   if (forwardedFor) {
//     return forwardedFor.split(",")[0] ?? FALLBACK_IP_ADDRESS;
//   }

//   return headers().get("x-real-ip") ?? FALLBACK_IP_ADDRESS;
// }
