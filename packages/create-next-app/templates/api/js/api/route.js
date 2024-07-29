export async function GET(request) {
    return new Response(JSON.stringify({ message: "Hello World" }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  export async function POST(request) {
    const data = await request.json();
    return new Response(JSON.stringify({ message: "Data received", data }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  export async function PUT(request) {
    const data = await request.json();
    return new Response(JSON.stringify({ message: "Data updated", data }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  export async function DELETE(request) {
    return new Response(JSON.stringify({ message: "Data deleted" }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  export async function OPTIONS() {
    return new Response(null, {
      headers: {
        'Allow': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Length': '0',
      },
    });
  }
  