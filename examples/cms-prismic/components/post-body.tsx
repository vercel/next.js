import { SliceZone } from "@prismicio/react";
import { Content } from "@prismicio/client";

import { components } from "../slices";

type PostBodyProps = {
  slices: Content.PostDocument["data"]["slices"];
};

export default function PostBody({ slices }: PostBodyProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <SliceZone slices={slices} components={components} />
    </div>
  );
}
