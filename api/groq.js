// Vercel Serverless Function — /api/groq
// Proxies requests from your Android app to Groq API.
// Your Groq API key lives ONLY in Vercel's encrypted Environment Variables.
// It is never in your code or your APK.

const https = require("https");

const GROQ_API_HOST = "api.groq.com";
const GROQ_API_PATH = "/openai/v1/chat/completions";

module.exports = async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-app-secret");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // --- Only POST allowed ---
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- Validate shared secret from Android app ---
  // Stored in Vercel → Project Settings → Environment Variables as APP_SECRET
  const appSecret = process.env.APP_SECRET;
  if (appSecret) {
    const provided = req.headers["x-app-secret"];
    if (provided !== appSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // --- Validate body ---
  const { model, messages, temperature, max_tokens } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array is required" });
  }

  // --- Groq API key from Vercel Environment Variable ---
  // Set in Vercel Dashboard → Project → Settings → Environment Variables
  // Name: GROQ_API_KEY  Value: gsk_...
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const payload = JSON.stringify({
    model: model || "llama3-8b-8192",
    messages,
    temperature: temperature ?? 0.7,
    max_tokens: max_tokens ?? 1024,
  });

  // --- Forward to Groq ---
  return new Promise((resolve) => {
    const options = {
      hostname: GROQ_API_HOST,
      path: GROQ_API_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const groqReq = https.request(options, (groqRes) => {
      let data = "";
      groqRes.on("data", (chunk) => (data += chunk));
      groqRes.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          res.status(groqRes.statusCode).json(parsed);
        } catch {
          res.status(500).json({ error: "Invalid response from Groq" });
        }
        resolve();
      });
    });

    groqReq.on("error", (err) => {
      console.error("Groq request error:", err);
      res.status(500).json({ error: "Failed to reach Groq API" });
      resolve();
    });

    groqReq.write(payload);
    groqReq.end();
  });
};
