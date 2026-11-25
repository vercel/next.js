const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function GET() {
  return Response.json(
    { message: "Hello from another origin" },
    { headers: corsHeaders },
  );
}

export function POST() {
  return Response.json(
    { message: "Hello from another origin" },
    { headers: corsHeaders },
  );
}
