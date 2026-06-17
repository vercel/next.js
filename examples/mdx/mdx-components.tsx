import type { MDXComponents } from "mdx/types";

const components: MDXComponents = {};

// Allows customizing built-in components, e.g. to add styling.
export function useMDXComponents(): MDXComponents {
  return components;
}
