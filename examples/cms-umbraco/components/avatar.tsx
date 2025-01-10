import Image from "next/image";
import Author from "../types/author";

type Props = {
  author: Author;
};

export default function Avatar({ author }: Props) {
  const name: string = author?.name;

  return (
    <div className="flex items-center">
      <div className="w-12 h-12 relative mr-4">
        <Image
          src={author.picture.url}
          layout="fill"
          className="rounded-full"
          alt={name}
        />
      </div>
      <div className="text-xl font-bold">{name}</div>
    </div>
  );
}
