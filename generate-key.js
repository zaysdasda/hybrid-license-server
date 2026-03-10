const fs = require("fs");
const path = require("path");

const LICENSE_FILE = path.join(__dirname, "licenses.json");

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

function loadLicenses() {
  if (!fs.existsSync(LICENSE_FILE)) {
    return [];
  }

  const raw = fs.readFileSync(LICENSE_FILE, "utf8");
  return JSON.parse(raw);
}

function saveLicenses(data) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2), "utf8");
}

function createLicense(tier) {
  const normalizedTier = String(tier).toUpperCase();

  if (!["BASIC", "PRO", "EXTREME"].includes(normalizedTier)) {
    console.log("Tier must be BASIC, PRO, or EXTREME");
    process.exit(1);
  }

  const licenses = loadLicenses();

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

  console.log("License Created:");
  console.log(key);
}

const tier = process.argv[2];

if (!tier) {
  console.log("Usage:");
  console.log("node generate-key.js BASIC");
  console.log("node generate-key.js PRO");
  console.log("node generate-key.js EXTREME");
  process.exit();
}

createLicense(tier);