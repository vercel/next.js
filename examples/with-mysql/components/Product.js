import Image from "next/image";

export default function Product({ product }) {
  const { name, description, price, image, category } = product;

  return (
    <div
      className="max-w-[250px] rounded overflow-hidden shadow-lg"
      key={product.id}
    >
      <Image
        className="w-full"
        width={250}
        height={250}
        objectFit="cover"
        src={image}
        alt={name}
      />
      <div className="px-6 py-4">
        <div className="font-bold text-xl mb-2">{name}</div>
        <p className="text-gray-700 text-base">{description}</p>
        <p className="text-gray-900 text-xl">${price}</p>
      </div>
      <div className="px-6 pt-4 pb-2">
        <span className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2">
          {category.name}
        </span>
      </div>
    </div>
  );
}
