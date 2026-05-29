/**
 * Test file for the rewrites in next.config.js. This is useful to test the logic for rewriting
 * paths to multi zones to make sure that the logic is correct before deploying the application.
 */

import { type MatchResult, compile, match } from "path-to-regexp";
import nextConfig from "../next.config.js";

function getDestination(destination: string, pathMatch: MatchResult): string {
  const hasDifferentHost = destination.startsWith("https://");
  if (hasDifferentHost) {
    const destinationUrl = new URL(destination);
    destinationUrl.pathname = compile(destinationUrl.pathname, {
      encode: encodeURIComponent,
    })(pathMatch.params);
    return destinationUrl.toString();
  }
  return compile(destination, {
    encode: encodeURIComponent,
  })(pathMatch.params);
}

const BLOG_URL = "https://with-zones-blog.vercel.app";

describe("next.config.js test", () => {
  describe("rewrites", () => {
    let rewrites: Awaited<ReturnType<NonNullable<typeof nextConfig.rewrites>>>;

    beforeAll(async () => {
      process.env.BLOG_URL = BLOG_URL;
      rewrites = await nextConfig.rewrites!();
    });

    function getRewrittenUrl(path: string): string | undefined {
      const allRewrites =
        "beforeFiles" in rewrites
          ? [...rewrites.beforeFiles, ...rewrites.afterFiles]
          : rewrites;
      for (const rewrite of allRewrites) {
        if (rewrite.has?.length) {
          continue;
        }
        const rewriteMatch = match(rewrite.source)(path);
        if (rewriteMatch) {
          return getDestination(rewrite.destination, rewriteMatch);
        }
      }
      return undefined;
    }

    it("non blog pages are not rewritten", () => {
      expect(getRewrittenUrl("/")).toEqual(undefined);
      expect(getRewrittenUrl("/blog-not")).toEqual(undefined);
      expect(getRewrittenUrl("/blog2")).toEqual(undefined);
    });

    it("/blog is rewritten to child zone", () => {
      expect(getRewrittenUrl("/blog")).toEqual(`${BLOG_URL}/blog`);
      expect(getRewrittenUrl("/blog/post/1")).toEqual(
        `${BLOG_URL}/blog/post/1`,
      );
    });

    it("/blog static resources are rewritten to child zone", () => {
      expect(
        getRewrittenUrl("/blog-static/_next/static/chunks/chunk.css"),
      ).toEqual(`${BLOG_URL}/blog-static/_next/static/chunks/chunk.css`);
    });
  });
});
