export async function GET(request) {
  try {
    return new Response(JSON.stringify({ message: "Hello World" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500, 
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    return new Response(JSON.stringify({ message: "Data received", data }), {
      status: 200, 
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500, 
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function PUT(request) {
  try {
    const data = await request.json();
    return new Response(JSON.stringify({ message: "Data updated", data }), {
      status: 200, 
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500, 
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(request) {
  try {
    return new Response(JSON.stringify({ message: "Data deleted" }), {
      status: 200, 
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500, 
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, PUT, DELETE, OPTIONS",
      "Content-Length": "0",
    },
  });
}
