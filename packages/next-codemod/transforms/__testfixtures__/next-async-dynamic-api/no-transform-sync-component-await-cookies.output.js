import { cookies } from "next/headers";

function MyComponent() {
  if (globalThis.condition) {
    // TODO: move cookies() outside of the condition
    callSomething(cookies());
  }
}
