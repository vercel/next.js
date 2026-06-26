// TODO: set origin here
const SOURCE_IMAGE_ORIGIN = "https://image-optimization-one.vercel.app";

export async function GET(req: Request) {
  if (!req.headers.get("user-agent")) {
    // TODO: add any other checks here
    return new Response("Forbidden", { status: 403 });
  }
  const path = new URL(req.url).pathname.slice("/image-api".length);
  if (!path) {
    return new Response("Bad Request", { status: 400 });
  }
  const res = await fetch(new URL(path, SOURCE_IMAGE_ORIGIN));
  const { status, headers, body } = res;
  return new Response(body, { status, headers });
}
