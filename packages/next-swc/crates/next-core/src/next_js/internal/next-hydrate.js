import App from "@vercel/turbopack-next/pages/_app";
import Component from ".";
import { hydrateRoot } from "react-dom/client";

const data = JSON.parse(document.getElementById("__NEXT_DATA__").textContent);
hydrateRoot(document.getElementById("__next"), <App Component={Component} pageProps={data.props} />);
