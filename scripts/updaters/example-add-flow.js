const fs = require("fs");

const jsonPath = process.argv[2];
if (!jsonPath) {
  throw new Error("Usage: node scripts/updaters/example-add-flow.js <json-path>");
}

const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
payload.flows = Array.isArray(payload.flows) ? payload.flows : [];

if (!payload.flows.some((flow) => flow.id === "example-added-flow")) {
  payload.flows.unshift({
    id: "example-added-flow",
    name: "Example added flow",
    version: "Draft",
    doc: {
      featureName: "Example added flow",
      status: "Draft",
      background: "A small generic flow added by an updater example.",
      includeScope: "Start, action, end.",
      excludeScope: "Domain-specific policy.",
      confirmItems: "Replace this example with real review questions.",
      assumptions: "This is a developer example."
    },
    nodes: [
      {
        id: "E1",
        type: "baNode",
        position: { x: 40, y: 88 },
        data: {
          lane: "Requester",
          kind: "start",
          title: "Start request",
          desc: "A requester begins the process.",
          constraint: "",
          width: 344,
          height: 160
        }
      },
      {
        id: "E2",
        type: "baNode",
        position: { x: 440, y: 360 },
        data: {
          lane: "Workspace",
          kind: "end",
          title: "Complete request",
          desc: "The workspace records the completed request.",
          constraint: "",
          width: 344,
          height: 160
        }
      }
    ],
    edges: [
      {
        id: "E1-E2",
        source: "E1",
        target: "E2",
        label: "Submitted",
        type: "cleanStep",
        sourceHandle: "right-2",
        targetHandle: "left-2"
      }
    ]
  });
}

payload.activeFlowId = "example-added-flow";
payload.savedAt = new Date().toISOString();
fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
