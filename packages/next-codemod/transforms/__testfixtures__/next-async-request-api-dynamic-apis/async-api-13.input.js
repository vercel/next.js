import { headers } from "next/headers";

async function MyComponent() {
  callSomething(headers());
}
