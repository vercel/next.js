"use client"
import React, { useEffect } from "react";
import { defineCustomElements as ionDefineCustomElements } from "@ionic/core/loader";
import "@ionic/core/css/core.css";
import "@ionic/core/css/normalize.css";
import "@ionic/core/css/structure.css";
import "@ionic/core/css/typography.css";
import "@ionic/core/css/padding.css";
import "@ionic/core/css/float-elements.css";
import "@ionic/core/css/text-alignment.css";
import "@ionic/core/css/text-transformation.css";
import "@ionic/core/css/flex-utils.css";
import "@ionic/core/css/display.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    ionDefineCustomElements(window);
  }, []);

  return (
    <html lang="en">
      <head />
      <body>
        <ion-app>
          <ion-header translucent>
            <ion-toolbar>
              <ion-title>Next.js with Ionic</ion-title>
            </ion-toolbar>
          </ion-header>

          <ion-content fullscreen>{children}</ion-content>

          <ion-footer>
            <ion-toolbar>
              <ion-title>Footer</ion-title>
            </ion-toolbar>
          </ion-footer>
        </ion-app>
      </body>
    </html>
  );
}
