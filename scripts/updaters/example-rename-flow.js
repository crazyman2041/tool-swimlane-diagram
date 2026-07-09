const fs = require("fs");

const jsonPath = process.argv[2];
if (!jsonPath) {
  throw new Error("Usage: node scripts/updaters/example-rename-flow.js <json-path>");
}

const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const flow = Array.isArray(payload.flows) ? payload.flows.find((item) => item.id === "flow-1") : null;
if (!flow) {
  throw new Error("Flow not found: flow-1");
}

flow.name = "Renamed example flow";
flow.doc = {
  ...(flow.doc || {}),
  featureName: "Renamed example flow"
};

payload.savedAt = new Date().toISOString();
fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
