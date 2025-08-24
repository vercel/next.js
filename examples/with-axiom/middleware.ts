import { NextResponse } from "next/server";
import { log, withAxiom } from "next-axiom";

async function middleware() {
  log.info("Hello from middleware", { bar: "baz" });
  return NextResponse.next();
}

export default withAxiom(middleware);
