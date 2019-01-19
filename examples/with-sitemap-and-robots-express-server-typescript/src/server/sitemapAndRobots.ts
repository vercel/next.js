import * as path from "path";
import * as sm from "sitemap";
import { posts } from "./posts";

const sitemap = sm.createSitemap({
  cacheTime: 600000, // 600 sec - cache purge period
  hostname: "https://sitemap-robots-typescript.now.sh",
});

const sitemapAndRobots = ({ server }) => {
  const Posts = posts();
  for (const post of Posts) {
    sitemap.add({
      changefreq: "daily",
      priority: 0.9,
      url: `/posts/${post.slug}`,
    });
  }

  sitemap.add({
    changefreq: "daily",
    priority: 1,
    url: "/a",
  });

  sitemap.add({
    changefreq: "daily",
    priority: 1,
    url: "/b",
  });
  // Note {} in next line is a placeholder filling the spot where the req parameter
  // would normally be listed (but isn't listed here since we aren't using it)
  server.get("/sitemap.xml", ({}, res) => {
    sitemap.toXML((err, xml) => {
      if (err) {
        res.status(500).end();
        return;
      }
      res.header("Content-Type", "application/xml");
      res.send(xml);
    });
  });
  // Note {} in next line is a placeholder filling the spot where the req parameter
  // would normally be listed (but isn't listed here since we aren't using it)
  server.get("/robots.txt", ({}, res) => {
    res.sendFile(path.join(__dirname, "../static", "robots.txt"));
  });
};

export { sitemapAndRobots };
