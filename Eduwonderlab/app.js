export async function onRequest(context) {
  return new Response(
    JSON.stringify({
      status: "online",
      message: "API working"
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}