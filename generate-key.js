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
  if (!fs.existsSync(LICENSE_FILE)) return [];
  return JSON.parse(fs.readFileSync(LICENSE_FILE, "utf8"));
}

function saveLicenses(data) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2));
}

function createLicense(tier) {
  const licenses = loadLicenses();

  const key = generateKey(tier);

  const newLicense = {
    key: key,
    tier: tier,
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

createLicense(tier.toUpperCase());