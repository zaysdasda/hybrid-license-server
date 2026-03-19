const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const LICENSE_FILE = path.join(__dirname, "licenses.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "hybridadmin123";

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
    fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenses, null, 2), "utf8");
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

  const saved = saveLicenses(licenses);
  if (!saved) {
    throw new Error("Failed to save new license");
  }

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

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Hybrid License Server running"
  });
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/admin-login", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

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

      const saved = saveLicenses(licenses);
      if (!saved) {
        return res.status(500).json({
          valid: false,
          message: "Failed to bind license"
        });
      }

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

    const saved = saveLicenses(licenses);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: "Failed to save revoked license"
      });
    }

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

    const saved = saveLicenses(licenses);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: "Failed to save unbound license"
      });
    }

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

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
