"use server";

import nodemailer from "nodemailer";

export async function sendTestEmail(formData: FormData) {
  const message =
    (formData.get("message") || "").toString().trim() ||
    "Hello from Mailtrap Local!";

  const transport = nodemailer.createTransport(
    process.env.EMAIL_SERVER || "smtp://localhost:3535",
  );

  await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to: "test@example.com",
    subject: "Test email from Next.js",
    text: message,
  });
}
