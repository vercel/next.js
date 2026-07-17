import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";

export type Product = {
  slug: string;
  name: string;
  description: string;
  price: number;
};

const products: Product[] = [
  {
    slug: "mug",
    name: "Mug",
    description: "A ceramic mug that holds exactly one build worth of coffee.",
    price: 14,
  },
  {
    slug: "tee",
    name: "T-shirt",
    description: "A heavyweight tee with a small triangle on the chest.",
    price: 28,
  },
  {
    slug: "sticker-pack",
    name: "Sticker pack",
    description: "Twelve stickers for laptops that have seen things.",
    price: 8,
  },
  {
    slug: "cap",
    name: "Cap",
    description: "A low-profile cap for shipping in the sun.",
    price: 22,
  },
];

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

export async function getProducts() {
  "use cache";
  cacheLife("hours");
  cacheTag("products");

  await delay();
  return products;
}

export async function getProduct(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("products", `product:${slug}`);

  await delay();
  const product = products.find((p) => p.slug === slug);
  if (!product) {
    notFound();
  }
  return product;
}

export async function searchProducts(query: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("products", `search:${query}`);

  await delay();
  const q = query.toLowerCase();
  return products.filter(
    (product) =>
      product.name.toLowerCase().includes(q) ||
      product.description.toLowerCase().includes(q),
  );
}
