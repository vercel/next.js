import { prepareClientPortals } from "@jesstelford/react-portal-universal";

if (typeof window !== "undefined") {
  // On the client, we have to run this once before React attempts a render.
  // Here in _app is a great place to do it as this file is only required once,
  // and right now (outside the constructor) is before React is invoked.
  prepareClientPortals();
}

export default function App({ Component, pageProps }) {
  return (
    /* This is where we'll render one of our universal portals */
    <>
      <div id="modal" />
      <Component {...pageProps} />
    </>
  );
}
