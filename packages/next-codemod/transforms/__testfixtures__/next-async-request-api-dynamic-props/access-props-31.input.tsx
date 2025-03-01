export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      slug: string;
    }>;
  },
): Promise<Response> {
  const { slug } = await params;
}
