"use client";

import ContentfulImage from "@/lib/contentful-image";
import { useContentfulInspectorMode } from "@contentful/live-preview/react";

export default function Avatar({
  id,
  name,
  picture,
}: {
  id: string;
  name: string;
  picture: any;
}) {
  const inspectorProps = useContentfulInspectorMode({ entryId: id });

  return (
    <div className="flex items-center">
      <div className="mr-4 w-12 h-12">
        <ContentfulImage
          alt={name}
          className="object-cover h-full rounded-full"
          height={48}
          width={48}
          src={picture.url}
          id={picture.sys.id}
        />
      </div>
      <div
        {...inspectorProps({ fieldId: "name" })}
        className="text-xl font-bold"
      >
        {name}
      </div>
    </div>
  );
}
