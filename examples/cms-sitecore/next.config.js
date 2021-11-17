const url = process.env.SITECORE_CONTENTHUB_PUBLIC_URL;
const { hostname } = new URL(url);
module.exports = {
  images: {
    domains: [ hostname , 'dummyimage.com'],
  },
}
