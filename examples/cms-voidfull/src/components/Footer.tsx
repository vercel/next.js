"use client";

import { useEffect, useMemo } from "react";
import { cn } from "@codecarrot/essentials";

export function Footer() {
  const link = useMemo(() => {
    const searchParams = new URLSearchParams();
    searchParams.set("utm_content", "Powered by Voidfull");
    searchParams.set("utm_medium", "footer");
    searchParams.set("utm_source", "template");
    searchParams.set("utm_campaign", "cms-voidfull");

    const url = "https://voidfull.com";
    return `${url}?${searchParams.toString()}`;
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("utm_referrer", encodeURI(window.location.href));
  }, []);

  return (
    <div className={cn("max-w-screen-md mx-auto px-4", "mt-24 mb-10")}>
      <footer className="flex items-center justify-center">
        <a
          href={link}
          className={cn(
            "px-3 py-1.5",
            "hover:bg-gray-100/70 rounded-md",
            "flex items-center",
            "space-x-1",
          )}
        >
          <div className={cn("w-3.5 h-3.5")}>
            <img
              className={cn("w-3.5 h-3.5 grayscale")}
              src="/voidfull.svg"
              alt="Voidfull Logo"
              loading="lazy"
              decoding="async"
              aria-hidden={true}
            />
          </div>
          <span className={cn("text-xs text-gray-500")}>
            Powered by Voidfull
          </span>
        </a>
      </footer>
    </div>
  );
}
