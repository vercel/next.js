"use client"; // Ensure it runs on the client side

import { Provider } from "mobx-react";
import { useStore } from "../store";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialState = { lastUpdate: Date.now(), light: false }; // Define an initial state
  const store = useStore(initialState); // Pass initialState

  return (
    <html lang="en">
      <body>
        <Provider store={store}>
          {children}
        </Provider>
      </body>
    </html>
  );
}
