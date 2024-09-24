import { registerOTel } from "@vercel/otel";

export function register() {
  registerOTel("next-app");
}
