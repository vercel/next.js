const globby = require("globby");

 function addPage(page:string) {
  const path = page.replace("app", "").replace(".js", "").replace(".mdx", "").replace("/page","");
  return path;
}
export default async function sitemap() {
  const pages = await globby([
    "app/**/*{.js,jsx,tx,tsx,.mdx}",
    "!app/_*.js",
    "!app/{sitemap,layout}.js",
    "!app/api",
  ]);
  const routes =pages.map((page:string) => ({
    url: `${process.env.WEBSITE_URL}${addPage(page)}`,
    lastModified: new Date().toISOString(),
  }));
 
  return [...routes];
}