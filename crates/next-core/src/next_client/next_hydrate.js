import Component from ".";
import { hydrateRoot } from "react-dom/client";

const data = JSON.parse(document.getElementById("__NEXT_DATA__").textContent);
hydrateRoot(document.getElementById("__next"), <Component {...data.props} />);
