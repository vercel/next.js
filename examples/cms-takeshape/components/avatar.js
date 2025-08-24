import Image from "next/image";
import { getImageUrl } from "takeshape-routing";

export default function Avatar({ name, picture }) {
  return (
    <div className="flex items-center">
      <div className="w-12 h-12 relative mr-4">
        <Image
          src={getImageUrl(picture.path, {
            fm: "jpg",
            fit: "crop",
            w: 100,
            h: 100,
            sat: -100,
          })}
          layout="fill"
          className="rounded-full"
          alt={name}
        />
      </div>
      <div className="text-xl font-bold">{name}</div>
    </div>
  );
}
