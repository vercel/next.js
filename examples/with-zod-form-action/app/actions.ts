"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { zodAction } from "zod-form-action";

const signupSchema = z
  .object({
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const signup = zodAction(signupSchema, async (data) => {
  // Simulate server-side processing.
  await new Promise((resolve) => setTimeout(resolve, 800));

  console.log("Validated signup:", data.email);

  redirect("/success");
});
