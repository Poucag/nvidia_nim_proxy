import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const NIM_API_BASE =
  process.env.NIM_API_BASE || "https://integrate.api.nvidia.com/v1";

const NIM_API_KEY = process.env.NIM_API_KEY;

if (!NIM_API_KEY) {
  console.error("❌ NIM_API_KEY não definida!");
  process.exit(1);
}

/* =========================================================
   MODELOS CUSTOMIZADOS (QUE VOCÊ QUER USAR)
========================================================= */

const MODEL_MAPPING = {
  "deepseek-v3.2": "deepseek-ai/deepseek-v3.2",
  "glm5": "zhipuai/glm-5",
  "glm4.7": "zhipuai/glm-4.7",
  "kimi-k2.5": "moonshotai/kimi-k2.5"
};

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "NVIDIA NIM OpenAI Proxy",
    models: Object.keys(MODEL_MAPPING)
  });
});

/* =========================================================
   LIST MODELS (OpenAI compatível)
========================================================= */

app.get("/v1/models", (req, res) => {
  res.json({
    object: "list",
    data: Object.keys(MODEL_MAPPING).map((m) => ({
      id: m,
      object: "model",
      created: Date.now(),
      owned_by: "nvidia-nim"
    }))
  });
});

/* =========================================================
   CHAT COMPLETIONS
========================================================= */

app.post("/v1/chat/completions", async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;

    const nimModel =
      MODEL_MAPPING[model] || MODEL_MAPPING["deepseek-v3.2"];

    const payload = {
      model: nimModel,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 4096,
      stream: stream ?? false
    };

    const response = await axios.post(
      `${NIM_API_BASE}/chat/completions`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${NIM_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: stream ? "stream" : "json"
      }
    );

    /* ================= STREAM ================= */

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      response.data.on("data", (chunk) => {
        res.write(chunk.toString());
      });

      response.data.on("end", () => {
        res.end();
      });

      return;
    }

    /* =============== NORMAL RESPONSE =============== */

    return res.json({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: response.data.choices,
      usage: response.data.usage
    });
  } catch (err) {
    console.error("❌ Proxy error:", err.response?.data || err.message);

    return res.status(500).json({
      error: {
        message: err.response?.data?.error?.message || "NIM request failed",
        type: "proxy_error"
      }
    });
  }
});

/* =========================================================
   FALLBACK 404
========================================================= */

app.all("*", (req, res) => {
  res.status(404).json({
    error: {
      message: "Endpoint not found"
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 NIM Proxy rodando na porta ${PORT}`);
});
