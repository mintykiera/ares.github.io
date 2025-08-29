require("dotenv").config();

const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Load all secrets and configurations from .env
const AI_API_URL = process.env.AI_API_URL;
const MODEL_MAPPING = {
  code: process.env.MODEL_CODE,
  math: process.env.MODEL_MATH,
  creative: process.env.MODEL_CREATIVE,
  general: process.env.MODEL_GENERAL,
};
const SYSTEM_PROMPT_SAFE = process.env.SYSTEM_PROMPT_SAFE;
const SYSTEM_PROMPT_UNSAFE = process.env.SYSTEM_PROMPT_UNSAFE;

app.use(cors());
app.use(express.json());

// Serve all frontend files from the 'public' folder FIRST.
app.use(express.static(path.join(__dirname, "public")));

// API endpoint. This will only be reached if the request is not for a static file.
app.post("/v1/chat/completions", async (req, res) => {
  try {
    // Receive settings, including the safety flag, from the client
    const { messages, temperature, max_tokens, disableSafety } = req.body;

    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    if (!lastUserMessage) {
      return res.status(400).json({ error: "No user message found" });
    }

    const taskType = detectTaskType(lastUserMessage.content);
    const modelName = MODEL_MAPPING[taskType] || MODEL_MAPPING.general;
    console.log(`Task: ${taskType}, Routing to model: ${modelName}`);

    // Prepare the final message list on the server
    const finalMessages = [...messages];
    const systemPrompt = disableSafety
      ? SYSTEM_PROMPT_UNSAFE
      : SYSTEM_PROMPT_SAFE;

    // Add the secret system prompt to the beginning of the message history
    if (systemPrompt) {
      finalMessages.unshift({ role: "system", content: systemPrompt });
    }

    if (!AI_API_URL || !modelName) {
      console.error(
        "Configuration error: AI_API_URL or model name is missing. Check your .env file."
      );
      return res.status(500).json({ error: "Server configuration error." });
    }

    // Proxy the request to the actual AI service with the chosen model and full message list
    const response = await fetch(`${AI_API_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: finalMessages, // Use the server-prepared messages
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
