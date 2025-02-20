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
      className="relative flex flex-col sm:flex-row bg-gray-100  
                rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
    >
      <Link
        className="absolute inset-0"
        href={`blogpost/${slug}`}
        aria-label={title}
      />
      {headerImage?.length && (
        <Image
          className="w-full sm:w-60 xl:w-80 h-fit"
          alt={headerImage[0].alt || ""}
          src={flotiqApiClient.helpers.getMediaUrl(headerImage[0])}
          width={640}
          height={640}
        />
      )}
      <div className="flex flex-col px-8 py-5 lg:pb-7 lg:pt-10">
        <h2>{title}</h2>
        <p className="sm:line-clamp-3 lg:line-clamp-none">{excerpt}</p>
        <span className="italic text-sm mt-16 sm:mt-auto">
          {moment(internal.createdAt).format("Do MMMM yyyy")}
        </span>
      </div>
    </div>
  );
}
