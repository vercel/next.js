import Link from "next/link";
import Image from "next/image";

export default function PostPreviewCondensed({
  title,
  coverImage,
  coverImageAlt,
  excerpt,
  slug,
}) {
  return (
    <div className="col-lg-4 col-md-8 col-sm-10">
      <div className="single-blog">
        {coverImage && (
          <div className="blog-header">
            <Image
              src={coverImage}
              alt={coverImageAlt}
              layout="fill"
              objectFit="cover"
            />
          </div>
        )}
        <div className="blog-body">
          <h5 className="package-name">
            <Link href={`/blog/${slug}`}>{title}</Link>
          </h5>
          <p>{excerpt}</p>
        </div>
        <div className="blog-footer">
          <Link href={`/blog/${slug}`} className="main-btn btn-hover">
            Read More
          </Link>
        </div>
      </div>
    </div>
  );
}
