// This is a Next-internal file that must not be exposed to end-users.
// Adapted from https://github.com/vercel/next.js/blob/canary/packages/next/shared/lib/html-context.ts

import { createContext } from "react";

export const HtmlContext = createContext(null);
