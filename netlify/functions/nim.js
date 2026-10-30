/**
 * Netlify Function: NVIDIA NIM Proxy
 * Forwards chat completion requests to NVIDIA NIM API
 */

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

export default async (request, context) => {
  // Only allow POST requests
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get API key from environment
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "NVIDIA_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Parse request body
    const body = await request.json();

    // Forward request to NVIDIA NIM
    const response = await fetch(NVIDIA_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Get response data
    const data = await response.arrayBuffer();

    // Return response with same status and content type
    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    console.error("NIM proxy error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};