export default {
  async fetch(request, env) {
    console.log(env); 

    const url = new URL(request.url);
    
    const allowedOrigins = ["https://agrofruit.pages.dev"];
    const origin = request.headers.get("Origin");

    if (!allowedOrigins.includes(origin)) {
      return new Response("Unauthorized", { status: 403 });
    }
   
    if (url.pathname === "/api/virtual") {
      if (!env.PAYSTACK_SECRET_KEY) {
        return new Response("Paystack Secret Key not found", { status: 500 });
      }

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
