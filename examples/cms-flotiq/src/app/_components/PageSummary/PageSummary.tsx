import Image from "next/image";

type PageSummaryProps = {
  title: string;
  description: React.ReactNode;
  imageUrl?: string;
  imageAlt?: string;
};

export default function PageSummary({
  title,
  description,
  imageUrl,
  imageAlt,
}: PageSummaryProps) {
  return (
    <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start gap-4 md:gap-8 ">
      {imageUrl && (
        <Image
          className="rounded-full h-auto w-40 lg:w-52 2xl:w-fit m-auto"
          alt={imageAlt || ""}
          src={imageUrl}
          width={200}
          height={200}
        />
      )}
      <div className="my-auto">
        <h1 className="text-center md:text-left">{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
