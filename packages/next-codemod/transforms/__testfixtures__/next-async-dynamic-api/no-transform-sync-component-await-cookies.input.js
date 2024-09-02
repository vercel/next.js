import { cookies } from "next/headers";

function MyComponent() {
  if (globalThis.condition) {
    callSomething(cookies());
  }
}
