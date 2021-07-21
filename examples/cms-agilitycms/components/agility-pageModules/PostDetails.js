import React from "react";
import { renderHTML } from "@agility/nextjs";
import { AgilityImage } from "@agility/nextjs"

const PostDetails = ({ dynamicPageItem }) => {
  // post fields
  const post = dynamicPageItem.fields;

  // category
  const category = post.category?.fields.title || "Uncategorized";

  // format date
  const dateStr = new Date(post.date).toLocaleDateString();

  return (
    <div className="relative px-8">
      <div className="max-w-screen-xl mx-auto">
        <div className="h-64 md:h-96 relative">
          <AgilityImage
            src={post.image.url}
            className="object-cover object-center rounded-lg"
            layout="fill"
          />
        </div>
        <div className="max-w-2xl mx-auto mt-4">
          <div className="uppercase text-primary-500 text-xs font-bold tracking-widest leading-loose">
            {category}
          </div>
          <div className="border-b-2 border-primary-500 w-8"></div>
          <div className="mt-4 uppercase text-gray-600 italic font-semibold text-xs">
            {dateStr}
          </div>
          <h1 className="font-display text-4xl font-bold my-6 text-secondary-500">
            {post.title}
          </h1>
          <div
            className="prose max-w-full mb-20"
            dangerouslySetInnerHTML={renderHTML(post.content)}
          />
        </div>
      </div>
    </div>
  );
};

export default PostDetails;
