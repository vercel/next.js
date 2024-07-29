

export async function GET(request, context) {
    const { params } = context;
    const { param } = params; // dynamic router
  
    return new Response(JSON.stringify({ message: `Hello, ${param}` }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  