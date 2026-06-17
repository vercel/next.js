import Image from "next/image";
import type {
  Product as ProductType,
  Category,
} from "@/lib/generated/prisma/client";

type ProductWithCategory = ProductType & {
  category: Category | null;
};

export function Product({ product }: { product: ProductWithCategory }) {
  const { name, description, price, image, category } = product;

  return (
    <div className="max-w-[250px] rounded overflow-hidden shadow-lg">
      <Image
        className="w-full object-cover"
        width={250}
        height={250}
        src={image}
        alt={name}
      />
      <div className="px-6 py-4">
        <div className="font-bold text-xl mb-2">{name}</div>
        <p className="text-gray-700 text-base">{description}</p>
        <p className="text-gray-900 text-xl">${price.toString()}</p>
      </div>
      <div className="px-6 pt-4 pb-2">
        {category && (
          <span className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2">
            {category.name}
          </span>
        )}
      </div>
    </div>
  );
}
