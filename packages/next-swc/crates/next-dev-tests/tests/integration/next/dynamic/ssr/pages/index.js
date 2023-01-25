import { useEffect } from "react";
import dynamic from "next/dynamic";

const Dynamic = dynamic(() => import("./_dynamic"));

let ssr = false;
if (typeof document !== "undefined") {
  ssr = document.getElementById("__next").innerText === "dynamic";
}

export default function Home() {
  useEffect(() => {
    import("@turbo/pack-test-harness").then(runClientSideTests);
  }, []);

  return <Dynamic />;
}

function runClientSideTests() {
  it("should render the dynamic component on the server-side", () => {
    expect(ssr).toBe(true);
  });
}
