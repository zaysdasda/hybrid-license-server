const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const LICENSE_FILE = path.join(__dirname, "licenses.json");

function loadLicenses() {
  if (!fs.existsSync(LICENSE_FILE)) {
    return [];
  }

  const raw = fs.readFileSync(LICENSE_FILE, "utf8");
  return JSON.parse(raw);
}

function saveLicenses(licenses) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenses, null, 2), "utf8");
}

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Hybrid Tweaks license server is running"
  });
});

app.post("/validate-license", (req, res) => {
  const { licenseKey, deviceId } = req.body;

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
      message: "License has been revoked"
    });
  }

  if (deviceId && license.deviceId && license.deviceId !== deviceId) {
    return res.json({
      valid: false,
      message: "License is already bound to another device"
    });
  }

  if (deviceId && !license.deviceId) {
    license.deviceId = deviceId;
    saveLicenses(licenses);
  }

  return res.json({
    valid: true,
    tier: license.tier,
    key: license.key,
    message: "License validated"
  });
});

app.post("/create-license", (req, res) => {
  const { key, tier } = req.body;

  if (!key || !tier) {
    return res.status(400).json({
      success: false,
      message: "Key and tier are required"
    });
  }

  const normalizedTier = String(tier).toUpperCase();
  if (!["BASIC", "PRO", "EXTREME"].includes(normalizedTier)) {
    return res.status(400).json({
      success: false,
      message: "Tier must be BASIC, PRO, or EXTREME"
    });
  }

  const licenses = loadLicenses();
  const exists = licenses.some(
    (item) => item.key.toLowerCase() === key.trim().toLowerCase()
  );

  if (exists) {
    return res.status(400).json({
      success: false,
      message: "License key already exists"
    });
  }

  licenses.push({
    key: key.trim(),
    tier: normalizedTier,
    revoked: false,
    deviceId: ""
  });

  saveLicenses(licenses);

  return res.json({
    success: true,
    message: "License created"
  });
});

app.post("/revoke-license", (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({
      success: false,
      message: "Key is required"
    });
  }

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

app.post("/unbind-license", (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({
      success: false,
      message: "Key is required"
    });
  }

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

app.listen(PORT, () => {
  console.log(`Hybrid Tweaks license server running on http://localhost:${PORT}`);
});
