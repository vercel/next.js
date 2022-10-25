import "@vercel/turbopack-next/internal/shims-client";

import { createRoot } from "react-dom/client";

import {
  initializeHMR,
  ReactDevOverlay,
} from "@vercel/turbopack-next/dev/client";
import { onUpdate } from "@vercel/turbopack-next/dev/hmr-client";

const pageChunkPath = location.pathname.slice(1);

onUpdate(
  {
    path: pageChunkPath,
    headers: {
      accept: "text/html",
    },
  },
  (update) => {
    if (update.type === "restart") {
      location.reload();
    }
  }
);

initializeHMR({
  assetPrefix: "",
});

const el = document.getElementById("__next")!;
el.innerText = "";

createRoot(el).render(<ReactDevOverlay />);
