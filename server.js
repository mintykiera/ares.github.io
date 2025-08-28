require("dotenv").config();

const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const AI_API_URL = process.env.AI_API_URL;

const MODEL_MAPPING = {
  code: process.env.MODEL_CODE,
  math: process.env.MODEL_MATH,
  creative: process.env.MODEL_CREATIVE,
  general: process.env.MODEL_GENERAL,
};

app.use(cors());
app.use(express.json());

// Any request that matches a file in here (like index.html) will be served immediately.
app.use(express.static(path.join(__dirname, "public")));

// HEALTH CHECK ROUTE (Now correctly placed after the static files)
app.get("/api/health", (req, res) => {
  // (Optional: I moved this to /api/health so it doesn't conflict with the main page)
  res.status(200).send("Hello from the Ares Backend!");
});

// API endpoint. This will only be reached if the request is not for a static file.
app.post("/v1/chat/completions", async (req, res) => {
  try {
    const { messages, temperature, max_tokens } = req.body;
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    if (!lastUserMessage) {
      return res.status(400).json({ error: "No user message found" });
    }

    const taskType = detectTaskType(lastUserMessage.content);
    const modelName = MODEL_MAPPING[taskType] || MODEL_MAPPING.general;
    console.log(`Task: ${taskType}, Routing to model: ${modelName}`);

    if (!AI_API_URL || !modelName) {
      console.error(
        "Configuration error: AI_API_URL or model name is missing. Check your .env file."
      );
      return res.status(500).json({ error: "Server configuration error." });
    }

    await fetch(`${AI_API_URL}/v1/models/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName }),
    });

    const response = await fetch(`${AI_API_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature,
        max_tokens,
        stream: false,
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Error in chat completion proxy:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

function detectTaskType(message) {
  const msg = message.toLowerCase();
  if (
    /\b(code|function|def |class |import |console\.|for |while )\b/.test(msg)
  ) {
    return "code";
  }
  if (
    /\b(calculate|math|equation|solve|formula|compute)\b/.test(msg) ||
    /[0-9\+\-\*\/\(\)\=\%\^]/.test(msg)
  ) {
    return "math";
  }
  if (/\b(story|write|poem|creative|fiction|narrative)\b/.test(msg)) {
    return "creative";
  }
  return "general";
}

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
