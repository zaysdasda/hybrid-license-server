const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const LICENSE_FILE = path.join(__dirname, "licenses.json");
const ADMIN_PASSWORD = "hybridadmin123";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
    key: key,
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
    (req.body && req.body.adminPassword) ||
    req.query.adminPassword;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
  }

  next();
}

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Hybrid Tweaks server running"
  });
});

app.get("/licenses", requireAdmin, (req, res) => {
  res.json({
    success: true,
    licenses: loadLicenses()
  });
});

app.post("/generate-license", requireAdmin, (req, res) => {
  const tier = req.body && req.body.tier;

  if (!tier) {
    return res.status(400).json({
      success: false,
      message: "Tier is required"
    });
  }

  const normalizedTier = String(tier).toUpperCase();

  if (!["BASIC", "PRO", "EXTREME"].includes(normalizedTier)) {
    return res.status(400).json({
      success: false,
      message: "Tier must be BASIC, PRO, or EXTREME"
    });
  }

  const license = createUniqueLicense(normalizedTier);

  return res.json({
    success: true,
    message: "License generated",
    license: license
  });
});

app.post("/validate-license", (req, res) => {
  const licenseKey = req.body && req.body.licenseKey;
  const hwid = req.body && req.body.hwid;

  if (!licenseKey || typeof licenseKey !== "string") {
    return res.status(400).json({
      valid: false,
      message: "License key is required"
    });
  }

  const licenses = loadLicenses();
  const license = licenses.find(
    (item) => item.key.toLowerCase() === licenseKey.trim().toLowerCase()
  );

  if (!license) {
    return res.json({
      valid: false,
      message: "Invalid license key"
    });
  }

  if (license.revoked) {
    return res.json({
      valid: false,
      message: "License revoked"
    });
  }

  if (!license.deviceId && hwid) {
    license.deviceId = hwid;
    saveLicenses(licenses);

    return res.json({
      valid: true,
      tier: license.tier,
      key: license.key,
      message: "License activated"
    });
  }

  if (license.deviceId === hwid) {
    return res.json({
      valid: true,
      tier: license.tier,
      key: license.key,
      message: "License validated"
    });
  }

  return res.json({
    valid: false,
    message: "License already used on another PC"
  });
});

app.post("/revoke-license", requireAdmin, (req, res) => {
  const key = req.body && req.body.key;

  const licenses = loadLicenses();
  const license = licenses.find(
    (item) => item.key.toLowerCase() === key.trim().toLowerCase()
  );

  if (!license) {
    return res.status(404).json({
      success: false,
      message: "License not found"
    });
  }

  license.revoked = true;
  saveLicenses(licenses);

  return res.json({
    success: true,
    message: "License revoked"
  });
});

app.post("/unbind-license", requireAdmin, (req, res) => {
  const key = req.body && req.body.key;

  const licenses = loadLicenses();
  const license = licenses.find(
    (item) => item.key.toLowerCase() === key.trim().toLowerCase()
  );

  if (!license) {
    return res.status(404).json({
      success: false,
      message: "License not found"
    });
  }

  license.deviceId = "";
  saveLicenses(licenses);

  return res.json({
    success: true,
    message: "License unbound"
  });
});

app.post("/hybrid-ai-chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Hybrid AI Assistant inside a PC optimization app called Hybrid Tweaks. Speak naturally like ChatGPT and help users with gaming performance, FPS issues, RAM usage, CPU load, lag, ping, and tweak suggestions."
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    res.json({
      reply: completion.choices[0].message.content
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI request failed" });
  }
});

app.listen(PORT, () => {
  console.log("Hybrid Tweaks server running on port " + PORT);
});
