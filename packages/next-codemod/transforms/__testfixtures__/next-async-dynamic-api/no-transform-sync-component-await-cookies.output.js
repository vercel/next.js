import { use } from "react";
import { cookies } from "next/headers";

function MyComponent() {
  if (globalThis.condition) {
    callSomething(use(cookies()));
  }
}
