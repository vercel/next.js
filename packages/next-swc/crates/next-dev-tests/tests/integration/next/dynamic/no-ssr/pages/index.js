import { useEffect } from "react";
import dynamic from "next/dynamic";

const Dynamic = dynamic(() => import("./_dynamic"), {
  ssr: false,
});

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
  it("should not render the dynamic component on the server-side when ssr: false", () => {
    expect(ssr).toBe(false);
  });
}
