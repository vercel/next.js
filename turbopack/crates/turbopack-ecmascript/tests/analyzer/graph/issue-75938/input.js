"use client";

import { useMemo } from "react";
import { fooBar } from "./external";

/** Add your relevant code here for the issue to reproduce */
export default function Home() {
  const helloWorld = useMemo(() => new HelloWorld(), []);
  return <button onClick={() => helloWorld.hi()}>Click me</button>;
}

class HelloWorld {
  hi() {
    this.#wrap(() => {
      alert(fooBar());
    });
  }

  #wrap(cb: Function) {
    return cb();
  }
}
