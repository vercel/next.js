/**
 * This component uses Portable Text to render a post body.
 *
 * You can learn more about Portable Text on:
 * https://www.sanity.io/docs/block-content
 * https://github.com/portabletext/react-portabletext
 * https://portabletext.org/
 *
 */

import { dataAttribute as baseDataAttribute } from "@/sanity/lib/dataAttribute";
import {
  PortableText,
  stegaClean,
  type PortableTextBlock,
  type PortableTextComponents,
} from "next-sanity";
import { draftMode } from "next/headers";
import { useId, type CSSProperties } from "react";
import { OptimisticPortableText } from "./optimistic-portable-text";

export default async function CustomPortableText({
  className,
  csm,
  value,
}: {
  className: string;
  csm?: {
    type: string;
    id: string;
    path: string;
  };
  value: PortableTextBlock[];
}) {
  const { isEnabled } = await draftMode();
  // const id = useId();
  const dataAttribute = csm ? baseDataAttribute.combine(csm) : null;
  function dataSanity(key: string | undefined) {
    return typeof key === "string"
      ? dataAttribute?.([{ _key: key }])
      : undefined;
  }
  function attrs(key: string | undefined) {
    if (!key) return null;
    return {
      "data-sanity": isEnabled ? dataSanity(key) : undefined,
      // @TODO use useId for this
      "data-sanity-drag-group": isEnabled ? "portable-text" : undefined,
      "data-sanity-drag-flow": isEnabled ? "vertical" : undefined,
      style: style(key),
    };
  }
  const components: PortableTextComponents = {
    block: {
      normal: ({ children, value }) => (
        <p key={value?._key} {...attrs(value?._key)}>
          {children}
        </p>
      ),
      blockquote: ({ children, value }) => (
        <blockquote key={value?._key} {...attrs(value?._key)}>
          {children}
        </blockquote>
      ),
      h1: ({ children, value }) => (
        <h1 key={value?._key} {...attrs(value?._key)}>
          {children}
        </h1>
      ),
      h2: ({ children, value }) => (
        <h2 key={value?._key} {...attrs(value?._key)}>
          {children}
        </h2>
      ),
      h3: ({ children, value }) => (
        <h3 key={value?._key} {...attrs(value?._key)}>
          {children}
        </h3>
      ),
      h4: ({ children, value }) => (
        <h4 key={value?._key} {...attrs(value?._key)}>
          {children}
        </h4>
      ),
      h5: ({ children, value }) => (
        <h5
          key={value?._key}
          {...attrs(value?._key)}
          className="mb-2 text-sm font-semibold"
        >
          {children}
        </h5>
      ),
      h6: ({ children, value }) => (
        <h6
          key={value?._key}
          {...attrs(value?._key)}
          className="mb-1 text-xs font-semibold"
        >
          {children}
        </h6>
      ),
    },
    list: {
      number: ({ children, value }) => (
        <ol key={value?._key} {...attrs(value?._key)}>
          {children}
        </ol>
      ),
      bullet: ({ children, value }) => (
        <ul key={value?._key} {...attrs(value?._key)}>
          {children}
        </ul>
      ),
    },
    listItem: ({ children, value }) => (
      <li key={value?._key} {...attrs(value?._key)}>
        {children}
      </li>
    ),
    marks: {
      link: ({ children, value }) => {
        return (
          <a
            key={value?._key}
            {...attrs(value?._key)}
            href={value?.href}
            className="whitespace-nowrap"
            rel="noreferrer noopener"
          >
            {children}
          </a>
        );
      },
    },
    types: {
      image: ({ value }) => {
        if (!value?.url) {
          return null;
        }
        return <img alt={value.alt || ""} src={value.url} />;
      },
    },
  };

  const result = (
    <PortableText components={components} value={stegaClean(value)} />
  );
  return (
    <div
      className={["prose", className].filter(Boolean).join(" ")}
      data-sanity={isEnabled ? dataAttribute?.toString() : undefined}
    >
      {csm && isEnabled ? (
        <OptimisticPortableText key={csm.id} csm={csm}>
          {result}
        </OptimisticPortableText>
      ) : (
        result
      )}
    </div>
  );
}

function getViewTransitionName(value: string | undefined) {
  return value ? `pt-${value}` : undefined;
}

function style(value: string | undefined): CSSProperties {
  return {
    viewTransitionName: getViewTransitionName(value),
  };
}
