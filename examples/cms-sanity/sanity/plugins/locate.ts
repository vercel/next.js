import { map, Observable } from "rxjs";
import type {
  DocumentLocation,
  DocumentLocationResolver,
  DocumentLocationsState,
} from "sanity/presentation";

import { resolveHref } from "@/sanity/lib/utils";

const homeLocation = {
  title: "Home",
  href: "/",
} satisfies DocumentLocation;

export const locate: DocumentLocationResolver = (params, context) => {
  if (params.type === "settings") {
    const doc$ = context.documentStore.listenQuery(
      `*[_type == "post" && defined(slug.current)]{title,slug}`,
      {},
      { perspective: "previewDrafts" },
    ) as Observable<
      | {
          slug: { current: string };
          title: string | null;
        }[]
      | null
    >;
    return doc$.pipe(
      map((docs) => {
        return {
          message: "This document is used on all pages",
          tone: "caution",
          locations: docs?.length
            ? [
                homeLocation,
                ...docs
                  .map((doc) => ({
                    title: doc?.title || "Untitled",
                    href: resolveHref("post", doc?.slug?.current)!,
                  }))
                  .filter((doc) => doc.href !== undefined),
              ]
            : [],
        } satisfies DocumentLocationsState;
      }),
    );
  }

  if (params.type === "post" || params.type === "author") {
    const doc$ = context.documentStore.listenQuery(
      `*[defined(slug.current) && _id==$id || references($id)]{_type,slug,title}`,
      params,
      { perspective: "previewDrafts" },
    ) as Observable<
      | {
          _type: string;
          slug: { current: string };
          title?: string | null;
        }[]
      | null
    >;
    return doc$.pipe(
      map((docs) => {
        switch (params.type) {
          case "author":
          case "post":
            return {
              locations: docs?.length
                ? [
                    homeLocation,
                    ...docs
                      .map((doc) => {
                        const href = resolveHref(doc._type, doc?.slug?.current);
                        return {
                          title: doc?.title || "Untitled",
                          href: href!,
                        };
                      })
                      .filter((doc) => doc.href !== undefined),
                  ]
                : [],
            } satisfies DocumentLocationsState;
          default:
            return {
              message: "Unable to map document type to locations",
              tone: "critical",
            } satisfies DocumentLocationsState;
        }
      }),
    );
  }

  return null;
};
