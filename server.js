const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔑 OPENAI SETUP
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 📁 FILE SETUP
const LICENSE_FILE = path.join(__dirname, "licenses.json");
const ADMIN_PASSWORD = "hybridadmin123";

// =====================
// LICENSE FUNCTIONS
// =====================
function loadLicenses() {
  if (!fs.existsSync(LICENSE_FILE)) return [];
  return JSON.parse(fs.readFileSync(LICENSE_FILE, "utf8"));
}

function saveLicenses(licenses) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenses, null, 2), "utf8");
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
  const normalizedTier = String(tier).toUpperCase();

  let key = "";
  let exists = true;

  while (exists) {
    key = generateKey(normalizedTier);
    exists = licenses.some((x) => x.key.toLowerCase() === key.toLowerCase());
  }

  const newLicense = {
    key,
    tier: normalizedTier,
    revoked: false,
    deviceId: ""
  };

  licenses.push(newLicense);
  saveLicenses(licenses);
  return newLicense;
}

function requireAdmin(req, res, next) {
  const password =
    req.headers["x-admin-password"] ||
    req.body?.adminPassword ||
    req.query.adminPassword;

  if (password !== ADMIN_PASSWORD) {
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
// 🔥 AI ROUTE (THIS FIXES EVERYTHING)
// =====================
app.post("/hybrid-ai-chat", async (req, res) => {
  try {
    const userMessage = req.body.message || "";

    if (!userMessage) {
      return res.json({ reply: "Ask me something." });
    }

    const response = await openai.chat.completions.create({
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
      ]
    });

    const reply = response.choices[0].message.content;

    res.json({ reply });
  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ reply: "AI request failed" });
  }
});

// =====================
// LICENSE ROUTES
// =====================
app.get("/licenses", requireAdmin, (req, res) => {
  res.json({
    success: true,
    licenses: loadLicenses()
  });
});

app.post("/generate-license", requireAdmin, (req, res) => {
  const tier = req.body?.tier;

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
});

app.post("/validate-license", (req, res) => {
  const { licenseKey, hwid } = req.body;

  const licenses = loadLicenses();
  const license = licenses.find(
    (x) => x.key.toLowerCase() === licenseKey?.toLowerCase()
  );

  if (!license) {
    return res.json({ valid: false, message: "Invalid key" });
  }

  if (license.revoked) {
    return res.json({ valid: false, message: "Revoked" });
  }

  if (!license.deviceId) {
    license.deviceId = hwid;
    saveLicenses(licenses);
    return res.json({ valid: true, tier: license.tier });
  }

  if (license.deviceId === hwid) {
    return res.json({ valid: true, tier: license.tier });
  }

  return res.json({ valid: false, message: "Already used" });
});

app.post("/revoke-license", requireAdmin, (req, res) => {
  const { key } = req.body;
  const licenses = loadLicenses();

  const license = licenses.find((x) => x.key === key);
  if (!license) return res.json({ success: false });

  license.revoked = true;
  saveLicenses(licenses);

  res.json({ success: true });
});

app.post("/unbind-license", requireAdmin, (req, res) => {
  const { key } = req.body;
  const licenses = loadLicenses();

  const license = licenses.find((x) => x.key === key);
  if (!license) return res.json({ success: false });

  license.deviceId = "";
  saveLicenses(licenses);

  res.json({ success: true });
});

// =====================
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
