"use client";

import { instance } from "cjs-modern-syntax";

export default function Page() {
  return (
    <>
      <div id="private-prop">{instance.getProp()}</div>
    </>
  );
}
