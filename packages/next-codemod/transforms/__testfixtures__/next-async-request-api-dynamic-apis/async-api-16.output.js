import { cookies } from "next/headers";

function MyComponent() {
  callSomething(/* Next.js Dynamic Async API Codemod: Manually await this call, if it's a Server Component */
  cookies());
}
