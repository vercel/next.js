import Head from "next/head";
import { toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.min.css";

import Global from "./global";
import Switch from "./switch";

import "./theme.css";

toast.configure({
  autoClose: false,
  hideProgressBar: true,
  position: toast.POSITION.BOTTOM_CENTER,
  closeButton: false
});

export default () => (
  <div>
    <Head>
      <meta charSet="utf-8" />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, shrink-to-fit=no"
      />
      <link
        href="//fonts.googleapis.com/icon?family=Material+Icons"
        rel="stylesheet"
      />
      <title>Coffee</title>
      <link rel="manifest" href="/static/manifest.json" />
      <script src="//cdn.jsdelivr.net/npm/resize-observer-polyfill@1.5.1/dist/ResizeObserver.min.js" />
    </Head>
    <Global />
    <Switch />
  </div>
);
