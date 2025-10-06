"use client";

import type { SanityDocument } from "@sanity/client";
import { get } from "@sanity/util/paths";
import { useOptimistic } from "next-sanity/hooks";
import { Children, isValidElement } from "react";

/**
 * This component allows drag and drop to reorder portable text optimistically, without requiring portable text components to be client components.
 */

export function OptimisticPortableText(props: {
  children: React.ReactNode;
  csm: {
    type: string;
    id: string;
    path: Parameters<typeof get>[1];
  };
}) {
  const { children, csm } = props;
  const childrenLength = Children.count(children);
  console.log({ childrenLength });

  const optimistic = useOptimistic<null | string[]>(null, (state, action) => {
    debugger;
    if (action.type !== csm.type || action.id !== csm.id) {
      console.log(
        "action.type !== csm.type || action.id !== csm.id",
        action.type,
        csm.type,
        action.id,
        csm.id,
      );
      return state;
    }
    const value = get(action.document, csm.path);
    if (!value) {
      console.error(
        "No value found for path",
        csm.path,
        "in document",
        action.document,
      );
      return state;
    }
    if (!Array.isArray(value)) {
      console.error(
        "Value at path",
        csm.path,
        "in document",
        action.document,
        "is not an array",
        value,
      );
      return state;
    }
    if (value.some((item) => typeof item !== "object" || !("_key" in item))) {
      console.error(
        "Value at path",
        csm.path,
        "in document",
        action.document,
        "contains items without _key",
        value,
      );
      return state;
    }
    const result = value.map(({ _key }) => _key as string);
    if (result.length !== childrenLength) {
      console.error(
        "Value at path",
        csm.path,
        "in document",
        action.document,
        "has a different length than children",
        value.length,
        "!==",
        childrenLength,
        "thus optimistic re-order is skipped",
      );
      return state;
    }
    return result;
  });

  if (optimistic) {
    // We reorder the server children props in two passes, first we create a map and fill it up with the given children
    const cache = new Map<string, React.ReactNode>();
    Children.forEach(children, (child) => {
      if (!isValidElement(child) || !child.key) return;
      cache.set(child.key, child);
    });
    // Then we map over the optimistic state, and grab the children from the cache
    return optimistic.map((key) => cache.get(key));
  }

  return children;
}
