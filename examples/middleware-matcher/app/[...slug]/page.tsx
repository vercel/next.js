"use client"; // Required for useParams() and accessing document.cookie

import { useParams } from "next/navigation";

function hasMiddlewareMatched(slug?: string[]) {
  if (typeof document === "undefined") return false;

  const values =
    document.cookie
      .split(";")
      .map((pair) => pair.split("="))
      .filter(([key]) => key === "middleware-slug")
      .map(([, value]) => value.trim()) ?? [];

  return values.some((value) => value === slug?.join("/"));
}

export default function ContentPage() {
  const params = useParams();
  const slug = Array.isArray(params.slug) ? params.slug : []; // Ensure it's always an array

  return (
    <>
      <h1>
        {hasMiddlewareMatched(slug)
          ? "Middleware matched!"
          : "Middleware ignored me"}
      </h1>
      <a href="/">{"<-"} back</a>
    </>
  );
}
