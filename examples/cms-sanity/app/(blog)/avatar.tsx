import { Image } from "next-sanity/image";

import { Author } from "@/sanity/lib/queries";
import { urlForImage } from "@/sanity/lib/utils";

export default function Avatar({ name, picture }: Author) {
  return (
    <div className="flex items-center text-xl">
      {picture?.asset?._ref ? (
        <div className="mr-4 h-12 w-12">
          <Image
            alt={picture?.alt || ""}
            className="h-full rounded-full object-cover"
            height={48}
            width={48}
            src={
              urlForImage(picture)
                ?.height(96)
                .width(96)
                .fit("crop")
                .url() as string
            }
          />
        </div>
      ) : (
        <div className="mr-1">By </div>
      )}
      <div className="text-pretty text-xl font-bold">{name}</div>
    </div>
  );
}
