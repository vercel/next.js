import App from "@vercel/turbopack-next/pages/_app";
// TODO(alexkirsz) We might need yet another transition that makes sure "." and
// its dependencies cannot use the next-alias transition, by removing it from
// the transition map.
import Component from ".";
import { hydrateRoot } from "react-dom/client";

const data = JSON.parse(document.getElementById("__NEXT_DATA__").textContent);
hydrateRoot(document.getElementById("__next"), <App Component={Component} pageProps={data.props} />);
