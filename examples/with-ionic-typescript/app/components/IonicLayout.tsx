// components/IonicLayout.tsx
"use client";

import React, { useEffect } from "react";
import { defineCustomElements as ionDefineCustomElements } from "@ionic/core/loader";

// Define Ionic custom elements on client-side
const IonicLayout = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    ionDefineCustomElements(window);
  }, []);

  return (
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
  );
};

export default IonicLayout;
