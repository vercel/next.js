import arcjet, { tokenBucket } from "@arcjet/next";
import { NextResponse } from "next/server";

const aj = arcjet({
  // Get your key from https://app.arcjet.com and set it as an environment
  // variable.
  key: process.env.ARCJET_KEY,
  // Arcjet supports multiple rules including bot protection and email
  // validation. See https://docs.arcjet.com
  rules: [
    // Create a token bucket rate limit. Fixed and sliding window rate limits
    // are also supported. See https://docs.arcjet.com/rate-limiting/algorithms
    tokenBucket({
      mode: "LIVE", // will block requests. Use "DRY_RUN" to log only
      // Use one of the built in characteristics e.g. ip.src, or create a custom
      // one. Any string is valid - here we use userId. See
      // https://docs.arcjet.com/rate-limiting/configuration#characteristics
      characteristics: ["userId"], // track requests by user ID
      refillRate: 100, // refill 100 tokens per interval
      interval: "1m", // 1 min interval
      capacity: 200, // bucket maximum capacity of 200 tokens
    }),
  ],
});

export async function GET(req: Request) {
  // The rate limit will be applied by userId and 50 tokens will be withdrawn
  // per request. Based on the rules above, 2 requests will consume all 100
  // tokens in the bucket. The bucket will then refill by 100 tokens every
  // minute to a maximum of 200. Set the user ID and requested tokens
  // dynamically e.g. based on the authenticated user and the "cost" of a
  // request e.g. AI tokens consumed.
  const decision = await aj.protect(req, { userId: "user1", requested: 50 });

  if (decision.isDenied()) {
    return NextResponse.json(
      {
        error: "Too Many Requests",
        reason: decision.reason,
      },
      {
        status: 429,
      }
    );
  }

  return NextResponse.json({ message: "Hello World" });
}