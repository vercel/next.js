import { cookies } from "next/headers";

async function MyComponent() {
  callSomething(cookies());
}
