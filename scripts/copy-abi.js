const fs = require("fs");
const path = require("path");

const artifactPath = path.join(
  __dirname,
  "..",
  "artifacts",
  "contracts",
  "PVAAuction.sol",
  "PVAAuction.json"
);
const outDir = path.join(__dirname, "..", "src", "abi");
const outPath = path.join(outDir, "PVAAuction.json");

if (!fs.existsSync(artifactPath)) {
  console.error("Artifact not found. Run: npx hardhat compile");
  process.exit(1);
}
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const artifact = JSON.parse(
  fs.readFileSync(artifactPath, "utf8")
);
const minimal = {
  abi: artifact.abi,
  contractName: artifact.contractName || "PVAAuction"
};
fs.writeFileSync(outPath, JSON.stringify(minimal, null, 2));
console.log("ABI written to", outPath);
