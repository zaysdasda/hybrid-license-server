const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const LICENSE_FILE = path.join(__dirname, "licenses.json");
const ADMIN_PASSWORD = "hybridadmin123";

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
    message: "Hybrid Tweaks license server is running"
  });
});

app.get("/admin-login", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Hybrid Tweaks Admin Login</title>
      <style>
        body { background:#050507; color:white; font-family:Arial; display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0; }
        .card { width:420px; background:#0b0b12; border:1px solid #2a163c; border-radius:20px; padding:28px; box-sizing:border-box; }
        h1 { margin:0 0 10px; font-size:30px; }
        p { color:#a1a1b3; margin-bottom:20px; }
        input { width:100%; padding:14px; box-sizing:border-box; border-radius:12px; border:1px solid #2a163c; background:#11111a; color:white; font-size:16px; margin-bottom:16px; }
        button { width:100%; padding:14px; border:none; border-radius:12px; background:#a855f7; color:white; font-size:16px; font-weight:bold; cursor:pointer; }
        .status { margin-top:14px; color:#d8b4fe; min-height:20px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Hybrid Tweaks Admin</h1>
        <p>Enter your admin password</p>
        <input type="password" id="password" placeholder="Admin password" />
        <button onclick="login()">Login</button>
        <div class="status" id="status"></div>
      </div>
      <script>
        async function login() {
          const password = document.getElementById("password").value;
          const status = document.getElementById("status");
          status.textContent = "Checking...";

          const response = await fetch("/admin-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
          });

          const data = await response.json();

          if (!data.success) {
            status.textContent = data.message || "Login failed";
            return;
          }

          localStorage.setItem("hybrid_admin_password", password);
          window.location.href = "/admin";
        }
      </script>
    </body>
    </html>
  `);
});

app.post("/admin-login", (req, res) => {
  const password = req.body && req.body.password;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin password"
    });
  }

  return res.json({
    success: true,
    message: "Login successful"
  });
});

app.get("/admin", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Hybrid Tweaks License Dashboard</title>
      <style>
        body { margin:0; font-family:Arial,sans-serif; background:#050507; color:white; padding:24px; }
        h1 { margin-top:0; font-size:32px; }
        .sub { color:#a1a1b3; margin-bottom:24px; }
        .card { background:#0b0b12; border:1px solid #2a163c; border-radius:20px; padding:20px; margin-bottom:20px; }
        select, button, input { padding:12px; border-radius:10px; border:1px solid #2a163c; background:#11111a; color:white; font-size:14px; margin-right:10px; margin-bottom:10px; }
        button { background:#a855f7; border:none; cursor:pointer; font-weight:bold; }
        .secondary { background:#1a1a25; border:1px solid #2a163c; }
        .status { color:#d8b4fe; margin-top:10px; min-height:20px; }
        table { width:100%; border-collapse:collapse; margin-top:12px; }
        th, td { border-bottom:1px solid #2a163c; text-align:left; padding:10px 8px; font-size:14px; }
        th { color:#c084fc; }
        .row-buttons button { margin-right:6px; margin-bottom:0; padding:8px 10px; font-size:12px; }
        .key { font-family:Consolas,monospace; }
      </style>
    </head>
    <body>
      <h1>Hybrid Tweaks License Dashboard</h1>
      <div class="sub">Generate, revoke, unbind, and manage licenses</div>

      <div class="card">
        <h2>Generate License</h2>
        <select id="tier">
          <option value="BASIC">BASIC</option>
          <option value="PRO">PRO</option>
          <option value="EXTREME">EXTREME</option>
        </select>
        <button onclick="generateLicense()">Generate Key</button>
        <button class="secondary" onclick="loadLicenses()">Refresh</button>
        <div class="status" id="status"></div>
      </div>

      <div class="card">
        <h2>All Licenses</h2>
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Tier</th>
              <th>Revoked</th>
              <th>HWID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="licensesTable"></tbody>
        </table>
      </div>

      <script>
        function getAdminPassword() {
          return localStorage.getItem("hybrid_admin_password") || "";
        }

        function setStatus(message) {
          document.getElementById("status").textContent = message;
        }

        async function generateLicense() {
          const tier = document.getElementById("tier").value;
          const adminPassword = getAdminPassword();

          if (!adminPassword) {
            window.location.href = "/admin-login";
            return;
          }

          setStatus("Generating...");

          const response = await fetch("/generate-license", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-admin-password": adminPassword
            },
            body: JSON.stringify({ tier: tier })
          });

          const data = await response.json();

          if (!data.success) {
            setStatus(data.message || "Failed to generate key");
            if (response.status === 401) {
              localStorage.removeItem("hybrid_admin_password");
              window.location.href = "/admin-login";
            }
            return;
          }

          setStatus("Generated: " + data.license.key);
          await loadLicenses();
        }

        async function revokeLicense(key) {
          const adminPassword = getAdminPassword();

          const response = await fetch("/revoke-license", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-admin-password": adminPassword
            },
            body: JSON.stringify({ key: key })
          });

          const data = await response.json();
          setStatus(data.message || "Updated");
          await loadLicenses();
        }

        async function unbindLicense(key) {
          const adminPassword = getAdminPassword();

          const response = await fetch("/unbind-license", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-admin-password": adminPassword
            },
            body: JSON.stringify({ key: key })
          });

          const data = await response.json();
          setStatus(data.message || "Updated");
          await loadLicenses();
        }

        async function loadLicenses() {
          const adminPassword = getAdminPassword();

          if (!adminPassword) {
            window.location.href = "/admin-login";
            return;
          }

          const response = await fetch("/licenses", {
            headers: {
              "x-admin-password": adminPassword
            }
          });

          const data = await response.json();

          if (!data.success) {
            if (response.status === 401) {
              localStorage.removeItem("hybrid_admin_password");
              window.location.href = "/admin-login";
              return;
            }

            setStatus(data.message || "Failed to load licenses");
            return;
          }

          const tbody = document.getElementById("licensesTable");
          tbody.innerHTML = "";

          data.licenses.forEach((license) => {
            const tr = document.createElement("tr");

            tr.innerHTML =
              "<td class='key'>" + license.key + "</td>" +
              "<td>" + license.tier + "</td>" +
              "<td>" + (license.revoked ? "Yes" : "No") + "</td>" +
              "<td>" + (license.deviceId || "") + "</td>" +
              "<td class='row-buttons'>" +
              "<button onclick=\\"revokeLicense('" + license.key + "')\\">Revoke</button>" +
              "<button class='secondary' onclick=\\"unbindLicense('" + license.key + "')\\">Unbind</button>" +
              "</td>";

            tbody.appendChild(tr);
          });
        }

        loadLicenses();
      </script>
    </body>
    </html>
  `);
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
      message: "License has been revoked"
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

app.post("/unbind-license", requireAdmin, (req, res) => {
  const key = req.body && req.body.key;

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
  console.log("Hybrid Tweaks license server running on port " + PORT);
});