import Image from "next/image";
import { urlForImage } from "../lib/sanity";

export default function Avatar({ name, picture }) {
  return (
    <div className="flex items-center">
      <div className="relative w-12 h-12 mr-4">
        <Image
          src={
            picture?.asset?._ref
              ? urlForImage(picture).height(96).width(96).fit("crop").url()
              : "https://source.unsplash.com/96x96/?face"
          }
          className="rounded-full"
          height={96}
          width={96}
          alt={name}
        />
      </div>
      <div className="text-xl font-bold">{name}</div>
    </div>
  );
}
