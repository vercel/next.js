"use client";

import { Loader2 } from "lucide-react";

export const LoadingInterstitial = ({ message = "Initializing StatelyTV..." }: { message?: string }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
    <div className="flex flex-col items-center space-y-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="text-lg text-muted-foreground text-center px-4 max-w-md">{message}</p>
    </div>
  </div>
);

