"use client";
import { Fragment } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Fragment>
      <Toaster
        closeButton
        toastOptions={{
          style: {
            borderRadius: "1rem",
          },
        }}
        position="bottom-center"
      />
      {children}
    </Fragment>
  );
}
