import { useEffect } from "react";
import { Inter } from "@next/font/google";

const interNoArgs = Inter();
const interWithVariableName = Inter({
  variable: "--my-font",
});

export default function Home() {
  useEffect(() => {
    // Only run on client
    import("@turbo/pack-test-harness").then(runTests);
  });

  return <div className={interNoArgs.className}>Test</div>;
}

function runTests() {
  it("returns structured data about the font styles from the font function", () => {
    expect(interNoArgs).toEqual({
      className:
        "className◽[project-with-next]/crates/next-dev-tests/tests/integration/next/font-google/basic/[embedded_modules]/@vercel/turbopack-next/internal/font/google/inter_34ab8b4d.module.css",
      style: {
        fontFamily: "'__Inter_34ab8b4d'",
        fontStyle: "normal",
      },
    });
  });

  it("includes a rule styling the exported className", async () => {
    const matchingRule = await getRuleMatchingClassName(interNoArgs.className);
    expect(matchingRule).toBeTruthy();
    expect(matchingRule.style.fontFamily).toEqual("__Inter_34ab8b4d");
    expect(matchingRule.style.fontStyle).toEqual("normal");
  });

  it("supports declaring a css custom property (css variable)", async () => {
    expect(interWithVariableName).toEqual({
      className:
        "className◽[project-with-next]/crates/next-dev-tests/tests/integration/next/font-google/basic/[embedded_modules]/@vercel/turbopack-next/internal/font/google/inter_c6e282f1.module.css",
      style: {
        fontFamily: "'__Inter_c6e282f1'",
        fontStyle: "normal",
      },
      variable:
        "variable◽[project-with-next]/crates/next-dev-tests/tests/integration/next/font-google/basic/[embedded_modules]/@vercel/turbopack-next/internal/font/google/inter_c6e282f1.module.css",
    });

    const matchingRule = await getRuleMatchingClassName(
      interWithVariableName.variable
    );
    expect(matchingRule.styleMap.get("--my-font").toString().trim()).toBe(
      '"__Inter_c6e282f1"'
    );
  });
}

async function getRuleMatchingClassName(className) {
  const selector = `.${CSS.escape(className)}`;

  let matchingRule;
  for (const stylesheet of document.querySelectorAll("link[rel=stylesheet]")) {
    if (stylesheet.sheet == null) {
      // Wait for the stylesheet to load completely if it hasn't already
      await new Promise((resolve) => {
        stylesheet.addEventListener("load", resolve);
      });
    }

    for (const rule of stylesheet.sheet.cssRules) {
      if (rule.selectorText === selector) {
        matchingRule = rule;
        break;
      }
    }
  }

  return matchingRule;
}
