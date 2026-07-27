import prisma from "@/lib/prisma";
import { Product } from "@/components/Product";

export default async function Home() {
  const products = await prisma.product.findMany({
    include: {
      category: true,
    },
  });

  return (
    <main className="p-10 mx-auto max-w-4xl">
      <h1 className="text-6xl font-bold mb-4 text-center">Next.js Starter</h1>
      <p className="mb-20 text-xl text-center">
        Shop from the hottest items in the world
      </p>
      <div className="grid md:grid-cols-3 sm:grid-cols-2 grid-cols-1 justify-items-center gap-4">
        {products.map((product) => (
          <Product key={product.id} product={product} />
        ))}
      </div>
    </main>
  );
}
