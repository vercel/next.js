export type RenderData = {
  params: Record<string, string>;
  method: string;
  url: string;
  path: string;
  query: NextParsedUrlQuery;
  headers: Record<string, HeaderValue>;
};
