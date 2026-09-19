const https = require("https");

const GROQ_API_HOST = "api.groq.com";
const GROQ_API_PATH = "/openai/v1/chat/completions";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-app-secret");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const appSecret = process.env.APP_SECRET;
  if (appSecret && req.headers["x-app-secret"] !== appSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let parsed = req.body;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
  }
  if (!parsed || !Array.isArray(parsed.messages)) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) return res.status(500).json({ error: "Server misconfiguration" });

  const payload = JSON.stringify({
    model: parsed.model || "qwen/qwen3.8-27b",
    messages: parsed.messages,
    temperature: parsed.temperature !== undefined ? parsed.temperature : 0.7,
    max_tokens: parsed.max_tokens || 1024,
  });

  return new Promise((resolve) => {
    const options = {
      hostname: GROQ_API_HOST,
      path: GROQ_API_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + groqApiKey,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const groqReq = https.request(options, (groqRes) => {
      let data = "";
      groqRes.on("data", (chunk) => (data += chunk));
      groqRes.on("end", () => {
        try {
          res.status(groqRes.statusCode).json(JSON.parse(data));
        } catch (e) {
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
