const PRODUCTION_API_KEY =
  process.env.ENTERSPEED_PRODUCTION_ENVIRONMENT_API_KEY;
const PREVIEW_API_KEY = process.env.ENTERSPEED_PREVIEW_ENVIRONMENT_API_KEY;

const call = async (query: string, preview: boolean) => {
  const url = `https://delivery.enterspeed.com/v1?${query}`;
  const response = await fetch(new Request(url), {
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": preview ? PREVIEW_API_KEY : PRODUCTION_API_KEY,
    },
  });

  return response.json();
};

export const getByHandle = async (handle: string, preview: boolean) => {
  const response = await call(`handle=${handle}`, preview);
  return response.views[handle];
};

export const getByUrl = async (url: string, preview: boolean) => {
  const response = await call(`url=${url}`, preview);
  return response.route;
};
