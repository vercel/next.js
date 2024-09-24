import { useRouter } from "next/router";

function hasMiddlewareMatched(slug?: string[]) {
  const values =
    (typeof document !== "undefined" ? document.cookie : "")
      .split(";")
      .map((pair) => pair.split("="))
      .filter(([key]) => key === "middleware-slug")
      .map(([, value]) => value.trim()) ?? [];
  return values.some((value) => value === slug?.join("/"));
}

export default function ContentPage() {
  const router = useRouter();
  const slug = router.query.slug as string[]; // slug is an array of path segments

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
