import Link from "next/link";
import { DateField, ImageField, TitleField } from "@prismicio/types";
import { PrismicText } from "@prismicio/react";
import { asText, isFilled } from "@prismicio/helpers";

import { AuthorContentRelationshipField } from "../lib/types";

import Avatar from "../components/avatar";
import CoverImage from "../components/cover-image";
import Date from "../components/date";

type HeroPostProps = {
  title: TitleField;
  coverImage: ImageField;
  date: DateField;
  excerpt: string;
  author: AuthorContentRelationshipField;
  href: string;
};

export default function HeroPost({
  title,
  coverImage,
  date,
  excerpt,
  author,
  href,
}: HeroPostProps) {
  return (
    <section>
      <div className="mb-8 md:mb-16">
        <CoverImage title={asText(title)} href={href} image={coverImage} />
      </div>
      <div className="md:grid md:grid-cols-2 md:gap-x-16 lg:gap-x-8 mb-20 md:mb-28">
        <div>
          <h3 className="mb-4 text-4xl lg:text-6xl leading-tight">
            <Link href={href} className="hover:underline">
              <PrismicText field={title} />
            </Link>
          </h3>
          <div className="mb-4 md:mb-0 text-lg">
            <Date dateField={date} />
          </div>
        </div>
        <div>
          <p className="text-lg leading-relaxed mb-4">{excerpt}</p>
          {isFilled.contentRelationship(author) && (
            <Avatar
              name={asText(author.data.name)}
              picture={author.data.picture}
            />
          )}
        </div>
      </div>
    </section>
  );
}
