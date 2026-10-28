A performance audit of the Ridgeline storefront found that its pages are far heavier than they need to be. Bring every page within these budgets:

| Page                              | HTML   | JavaScript | Images |
| --------------------------------- | ------ | ---------- | ------ |
| `/`                               | 80 KB  | 600 KB     | 200 KB |
| `/products`                       | 320 KB | 600 KB     | 200 KB |
| `/products/<slug>`, every product | 80 KB  | 600 KB     | 200 KB |
| `/about`                          | 40 KB  | 600 KB     | 200 KB |

Each budget is the total uncompressed size of that kind of file that a production build (`next build` and `next start`) sends when the page is opened in a 1280×800 browser window without scrolling: the HTML document itself, every JavaScript file, and every image.

The catalog changes every week: products added to `lib/catalog.json` and photos added to `public/photos` later must stay within the same budgets on their pages with no extra steps beyond the normal build.

The storefront must look and work exactly as it does now: the same content on every page, the same layout and image sizes, the same alt text, and the same interactions, including the category filter and sorting on `/products`, saving products, the product photo gallery, "Show all reviews", adding to the cart, and the newsletter form. Do not add dependencies.
