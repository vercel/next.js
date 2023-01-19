import { useEffect } from "react";
import { Inter } from "@next/font/google";
import { Deferred } from "@turbo/pack-test-harness/deferred";

const interNoArgs = Inter();

let testResult = new Deferred();

export default function Home() {
  useEffect(() => {
    // Only run on client
    import("@turbo/pack-test-harness").then(runTests);
  });

  return <div className={interNoArgs.className}>Test</div>;
}

globalThis.waitForTests = function () {
  return testResult.promise;
};

function runTests() {
  it("returns structured data about the font styles from the font function", () => {
    expect(interNoArgs).toEqual({
      className:
        "className◽[project-with-next]/crates/next-dev/tests/integration/next/font-google/basic/[embedded_modules]/@vercel/turbopack-next/internal/font/google/inter_34ab8b4d.module.css",
      style: {
        fontFamily: "'__Inter_34ab8b4d'",
        fontStyle: "normal",
      },
    });
  });

  it("includes a rule styling the exported className", () => {
    const selector = `.${CSS.escape(interNoArgs.className)}`;

    let matchingRule;
    for (const stylesheet of document.querySelectorAll(
      "link[rel=stylesheet]"
    )) {
      const sheet = stylesheet.sheet;
      if (sheet == null) {
        continue;
      }

      for (const rule of sheet.cssRules) {
        if (rule.selectorText === selector) {
          matchingRule = rule;
          break;
        }
      }
    }

    expect(matchingRule).toBeTruthy();
    expect(matchingRule.style.fontFamily).toEqual("__Inter_34ab8b4d");
    expect(matchingRule.style.fontStyle).toEqual("normal");
  });

  testResult.resolve(__jest__.run());
}
