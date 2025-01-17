import Link from "next/link";

export default function CategoriesWidget({ categories }) {
  return (
    <div className="widget categories-widget">
      <h5 className="widget-title">Categories</h5>
      <ul className="categories-list">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link href={`/blog/category/${category.slug}`}>
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
