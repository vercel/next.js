import { use } from "react";
import { cookies } from "next/headers";

function MyComponent() {
  callSomething(use(cookies()));
}
