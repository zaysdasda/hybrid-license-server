const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3001;

// =====================
// APP MIDDLEWARE
// =====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================
// ENV / CONFIG
// =====================
const LICENSE_FILE = path.join(__dirname, "licenses.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "hybridadmin123";

let openai = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  return openai;
}

// =====================
// LICENSE FUNCTIONS
// =====================
function loadLicenses() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) {
      fs.writeFileSync(LICENSE_FILE, "[]", "utf8");
      return [];
    }

    const raw = fs.readFileSync(LICENSE_FILE, "utf8").trim();

    if (!raw) {
      fs.writeFileSync(LICENSE_FILE, "[]", "utf8");
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to load licenses.json:", err);
    return [];
  }
}

function saveLicenses(licenses) {
  try {
    fs.writeFileSync(
      LICENSE_FILE,
      JSON.stringify(licenses, null, 2),
      "utf8"
    );
    return true;
  } catch (err) {
    console.error("Failed to save licenses.json:", err);
    return false;
  }
}

function randomBlock(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}

function generateKey(tier) {
  return `HYB-${tier}-${randomBlock()}-${randomBlock()}-${randomBlock()}`;
}

function createUniqueLicense(tier) {
  const licenses = loadLicenses();
  const normalizedTier = String(tier).trim().toUpperCase();

  let key = "";
  let exists = true;

  while (exists) {
    key = generateKey(normalizedTier);
    exists = licenses.some(
      (x) => String(x.key || "").toLowerCase() === key.toLowerCase()
    );
  }

  const newLicense = {
    key,
    tier: normalizedTier,
    revoked: false,
    deviceId: "",
    createdAt: new Date().toISOString()
  };

  licenses.push(newLicense);
  saveLicenses(licenses);

  return newLicense;
}

function requireAdmin(req, res, next) {
  const password =
    req.headers["x-admin-password"] ||
    req.body?.adminPassword ||
    req.query?.adminPassword;

  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
  }

  next();
}

// =====================
// BASIC ROUTE
// =====================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Hybrid Tweaks server running"
  });
});

// =====================
// AI ROUTE
// =====================
app.post("/hybrid-ai-chat", async (req, res) => {
  try {
    const userMessage = String(req.body?.message || "").trim();

    if (!userMessage) {
      return res.json({ reply: "Ask me something." });
    }

    const client = getOpenAIClient();

    if (!client) {
      return res.status(500).json({
        reply: "AI is not configured. Add OPENAI_API_KEY to your environment variables."
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Hybrid AI, a Fortnite performance expert. Help users increase FPS, reduce lag, analyze PC performance, suggest tweak packs, estimate FPS gains, and speak naturally like ChatGPT."
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      temperature: 0.7,
      max_tokens: 400
    });

    const reply =
      response?.choices?.[0]?.message?.content ||
      "I couldn't generate a response.";

    res.json({ reply });
  } catch (err) {
    console.error("AI ERROR:", err?.response?.data || err.message || err);
    res.status(500).json({ reply: "AI request failed" });
  }
});

// =====================
// LICENSE ROUTES
// =====================
app.get("/licenses", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      licenses: loadLicenses()
    });
  } catch (err) {
    console.error("GET /licenses error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load licenses"
    });
  }
});

app.post("/generate-license", requireAdmin, (req, res) => {
  try {
    const tier = String(req.body?.tier || "").trim();

    if (!tier) {
      return res.status(400).json({
        success: false,
        message: "Tier required"
      });
    }

    const license = createUniqueLicense(tier);

    res.json({
      success: true,
      license
    });
  } catch (err) {
    console.error("POST /generate-license error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to generate license"
    });
  }
});

app.post("/validate-license", (req, res) => {
  try {
    const licenseKey = String(req.body?.licenseKey || "").trim();
    const hwid = String(req.body?.hwid || "").trim();

    if (!licenseKey) {
      return res.status(400).json({
        valid: false,
        message: "License key required"
      });
    }

    if (!hwid) {
      return res.status(400).json({
        valid: false,
        message: "HWID required"
      });
    }

    const licenses = loadLicenses();
    const license = licenses.find(
      (x) => String(x.key || "").toLowerCase() === licenseKey.toLowerCase()
    );

    if (!license) {
      return res.json({
        valid: false,
        message: "Invalid key"
      });
    }

    if (license.revoked) {
      return res.json({
        valid: false,
        message: "Revoked"
      });
    }

    if (!license.deviceId) {
      license.deviceId = hwid;
      saveLicenses(licenses);

      return res.json({
        valid: true,
        tier: license.tier
      });
    }

    if (license.deviceId === hwid) {
      return res.json({
        valid: true,
        tier: license.tier
      });
    }

    return res.json({
      valid: false,
      message: "Already used"
    });
  } catch (err) {
    console.error("POST /validate-license error:", err);
    res.status(500).json({
      valid: false,
      message: "Validation failed"
    });
  }
});

app.post("/revoke-license", requireAdmin, (req, res) => {
  try {
    const key = String(req.body?.key || "").trim();

    if (!key) {
      return res.status(400).json({
        success: false,
        message: "Key required"
      });
    }

    const licenses = loadLicenses();
    const license = licenses.find(
      (x) => String(x.key || "").toLowerCase() === key.toLowerCase()
    );

    if (!license) {
      return res.status(404).json({
        success: false,
        message: "License not found"
      });
    }

    license.revoked = true;
    saveLicenses(licenses);

    res.json({
      success: true,
      message: "License revoked"
    });
  } catch (err) {
    console.error("POST /revoke-license error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to revoke license"
    });
  }
});

app.post("/unbind-license", requireAdmin, (req, res) => {
  try {
    const key = String(req.body?.key || "").trim();

    if (!key) {
      return res.status(400).json({
        success: false,
        message: "Key required"
      });
    }

    const licenses = loadLicenses();
    const license = licenses.find(
      (x) => String(x.key || "").toLowerCase() === key.toLowerCase()
    );

    if (!license) {
      return res.status(404).json({
        success: false,
        message: "License not found"
      });
    }

    license.deviceId = "";
    saveLicenses(licenses);

    res.json({
      success: true,
      message: "License unbound"
    });
  } catch (err) {
    console.error("POST /unbind-license error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to unbind license"
    });
  }
});

// =====================
// START SERVER
// =====================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
