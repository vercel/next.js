import { PrismicText } from "@prismicio/react";
import { asText, isFilled } from "@prismicio/helpers";
import { DateField, ImageField, TitleField } from "@prismicio/types";

import { AuthorContentRelationshipField } from "../lib/types";

import Avatar from "../components/avatar";
import Date from "../components/date";
import CoverImage from "../components/cover-image";
import PostTitle from "../components/post-title";

type PostHeaderProps = {
  title: TitleField;
  coverImage: ImageField;
  date: DateField;
  author: AuthorContentRelationshipField;
};

export default function PostHeader({
  title,
  coverImage,
  date,
  author,
}: PostHeaderProps) {
  return (
    <>
      <PostTitle>
        <PrismicText field={title} />
      </PostTitle>
      <div className="hidden md:block md:mb-12">
        {isFilled.contentRelationship(author) && (
          <Avatar
            name={asText(author.data.name)}
            picture={author.data.picture}
          />
        )}
      </div>
      <div className="mb-8 md:mb-16 sm:mx-0">
        <CoverImage title={asText(title)} image={coverImage} />
      </div>
      <div className="max-w-2xl mx-auto">
        <div className="block md:hidden mb-6">
          {isFilled.contentRelationship(author) && (
            <Avatar
              name={asText(author.data.name)}
              picture={author.data.picture}
            />
          )}
        </div>
        <div className="mb-6 text-lg">
          <Date dateField={date} />
        </div>
      </div>
    </>
  );
}
