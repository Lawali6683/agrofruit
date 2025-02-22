export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    const allowedOrigins = ["https://agrofruit.pages.dev"];
    const origin = request.headers.get("Origin");

    if (!allowedOrigins.includes(origin)) {
      return new Response("Unauthorized", { status: 403 });
    }
   
    if (url.pathname === "/api/virtual") {
      return new Response(env.PAYSTACK_SECRET_KEY, {
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": origin,
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
