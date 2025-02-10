import moment from "moment";
import Image from "next/image";
import Link from "next/link";

import { flotiqApiClient } from "@/flotiq-api-client";
import { BlogpostHydrated } from "@flotiq/flotiq-api-sdk";

export default function BlogPostCard({
  title,
  slug,
  excerpt,
  headerImage,
  internal,
}: BlogpostHydrated) {
  return (
    <div
      className="relative flex flex-col sm:flex-row sm:gap-4 bg-gray-100  
                rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
    >
      <Link
        className="absolute inset-0"
        href={`blogpost/${slug}`}
        aria-label={title}
      />
      {headerImage?.length && (
        <Image
          className="w-full sm:w-52 xl:w-80 h-fit"
          alt={headerImage[0].alt || ""}
          src={flotiqApiClient.helpers.getMediaUrl(headerImage[0])}
          width={640}
          height={640}
        />
      )}
      <div className="flex flex-col p-4">
        <h2>{title}</h2>
        <p className="line-clamp-3">{excerpt}</p>
        <span className="italic text-sm mt-2 sm:mt-auto">
          {moment(internal.createdAt).format("Do MMMM yyyy")}
        </span>
      </div>
    </div>
  );
}
