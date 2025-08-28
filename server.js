const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// The URL for your actual AI backend API
const AI_API_URL = 'https://a6247a59aee0.ngrok-free.app';

// Model mapping - This is now securely kept on the server
const MODEL_MAPPING = {
  code: "deepseek-coder-v2-lite-instruct",
  math: "meta-llama-meta-llama-3.1-8b-instruct",
  creative: "deepseek/deepseek-r1-0528-qwen3-8b",
  general: "meta-llama-Meta-Llama-3.1-8B-Instruct"
};

app.use(cors());
app.use(express.json());

// This function is moved from your client-side code to the server
function detectTaskType(message) {
  const msg = message.toLowerCase();
  if (/\b(code|function|def |class |import |console\.|for |while )\b/.test(msg)) {
    return "code";
  }
  if (/\b(calculate|math|equation|solve|formula|compute)\b/.test(msg) || /[0-9\+\-\*\/\(\)\=\%\^]/.test(msg)) {
    return "math";
  }
  if (/\b(story|write|poem|creative|fiction|narrative)\b/.test(msg)) {
    return "creative";
  }
  return "general";
}

// A single, unified endpoint for your client to call
app.post('/v1/chat/completions', async (req, res) => {
  try {
    // The client sends the request without any model information
    const { messages, temperature, max_tokens } = req.body;

    // 1. Identify the last user message to determine the task type
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
        return res.status(400).json({ error: 'No user message found' });
    }

    // 2. Detect the task and select the appropriate model
    const taskType = detectTaskType(lastUserMessage.content);
    const modelName = MODEL_MAPPING[taskType] || MODEL_MAPPING.general;
    console.log(`Task: ${taskType}, Routing to model: ${modelName}`);

    // 3. (Optional but recommended) Handle the model loading on the server
    // This call ensures the correct model is ready before the completion request.
    await fetch(`${AI_API_URL}/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName }),
    });

    // 4. Proxy the request to the actual AI service with the chosen model
    const response = await fetch(`${AI_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName, // The server adds the correct model here
        messages,
        temperature,
        max_tokens,
        stream: false,
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);

  } catch (error) {
    console.error('Error in chat completion proxy:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Serve your static frontend files (index.html, script.js, etc.)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});