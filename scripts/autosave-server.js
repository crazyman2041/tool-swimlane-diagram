const http = require("http");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const crypto = require("crypto");

const host = "127.0.0.1";
const port = Number(process.env.SWIMLANE_AUTOSAVE_PORT || 8788);
const autosavePath = path.join(__dirname, "..", "tool-swimlane-diagram.autosave.json");
const pausePath = `${autosavePath}.paused`;
const connectionPointIds = [
  "top-1", "top-2", "top-3",
  "right-1", "right-2", "right-3",
  "bottom-1", "bottom-2", "bottom-3",
  "left-1", "left-2", "left-3"
];
const legacyHandlePointMap = {
  "source-top": "top-2",
  "target-top": "top-2",
  "source-right": "right-2",
  "target-right": "right-2",
  "source-bottom": "bottom-2",
  "target-bottom": "bottom-2",
  "source-left": "left-2",
  "target-left": "left-2"
};

function send(res, status, body, contentType = "application/json", extraHeaders = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-BA-Flow-Base-SavedAt",
    "Access-Control-Expose-Headers": "X-BA-Flow-SavedAt,X-BA-Flow-Hash",
    "Content-Type": `${contentType}; charset=utf-8`,
    ...extraHeaders
  });
  res.end(body);
}

function isAutosavePaused() {
  return fs.existsSync(pausePath);
}

function setAutosavePaused(paused) {
  if (paused) {
    fs.writeFileSync(pausePath, `${new Date().toISOString()}\n`, "utf8");
    return true;
  }
  if (fs.existsSync(pausePath)) fs.unlinkSync(pausePath);
  return false;
}

function readAutosaveSnapshot() {
  if (!fs.existsSync(autosavePath)) {
    return { exists: false, raw: "", savedAt: "", hash: "" };
  }
  const raw = fs.readFileSync(autosavePath, "utf8");
  let savedAt = "";
  try {
    const parsed = JSON.parse(raw);
    savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : "";
  } catch {
    savedAt = "";
  }
  return {
    exists: true,
    raw,
    savedAt,
    hash: crypto.createHash("sha256").update(raw).digest("hex")
  };
}

function snapshotHeaders(snapshot) {
  return {
    "X-BA-Flow-SavedAt": snapshot.savedAt || "",
    "X-BA-Flow-Hash": snapshot.hash || ""
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeHandleId(handleId, fallback) {
  if (connectionPointIds.includes(handleId)) return handleId;
  if (legacyHandlePointMap[handleId]) return legacyHandlePointMap[handleId];
  const pointId = String(handleId || "")
    .replace(/^source-/, "")
    .replace(/^target-/, "")
    .replace(/^handle-/, "");
  return connectionPointIds.includes(pointId) ? pointId : fallback;
}

function normalizeFlowEdges(edges) {
  return (Array.isArray(edges) ? edges : []).map((edge) => {
    const nextEdge = {
      ...edge,
      sourceHandle: normalizeHandleId(edge.sourceHandle, "right-2"),
      targetHandle: normalizeHandleId(edge.targetHandle, "left-2"),
      type: edge.type === "straight" ? "straight" : "cleanStep"
    };
    if (nextEdge.type === "cleanStep") nextEdge.pathOptions = {};
    return nextEdge;
  });
}

function normalizePayload(payload) {
  return {
    ...payload,
    flows: Array.isArray(payload?.flows)
      ? payload.flows.map((flow) => ({
        ...flow,
        edges: normalizeFlowEdges(flow.edges)
      }))
      : payload?.flows
  };
}

function openAutosaveLocation() {
  fs.mkdirSync(path.dirname(autosavePath), { recursive: true });
  if (!fs.existsSync(autosavePath)) fs.writeFileSync(autosavePath, "{}\n", "utf8");
  if (process.platform === "win32") {
    childProcess.spawn("explorer.exe", ["/select,", autosavePath], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  childProcess.spawn(opener, [path.dirname(autosavePath)], { detached: true, stdio: "ignore" }).unref();
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }

    if (req.url === "/health") {
      const snapshot = readAutosaveSnapshot();
      send(res, 200, JSON.stringify({
        ok: true,
        autosavePath,
        paused: isAutosavePaused(),
        savedAt: snapshot.savedAt,
        hash: snapshot.hash
      }), "application/json", snapshotHeaders(snapshot));
      return;
    }

    if (req.url === "/autosave-control") {
      if (req.method === "GET") {
        const snapshot = readAutosaveSnapshot();
        send(res, 200, JSON.stringify({
          ok: true,
          autosavePath,
          paused: isAutosavePaused(),
          savedAt: snapshot.savedAt,
          hash: snapshot.hash
        }), "application/json", snapshotHeaders(snapshot));
        return;
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const parsed = body.trim() ? JSON.parse(body) : {};
        const paused = setAutosavePaused(Boolean(parsed.paused));
        send(res, 200, JSON.stringify({ ok: true, autosavePath, paused }));
        return;
      }
      send(res, 405, JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }

    if (req.url === "/open-folder") {
      openAutosaveLocation();
      send(res, 200, JSON.stringify({ ok: true, autosavePath }));
      return;
    }

    if (req.url !== "/ba-flow-autosave") {
      send(res, 404, JSON.stringify({ ok: false, error: "Not found" }));
      return;
    }

    if (req.method === "GET") {
      if (!fs.existsSync(autosavePath)) {
        send(res, 204, "");
        return;
      }
      const snapshot = readAutosaveSnapshot();
      send(res, 200, snapshot.raw, "application/json", snapshotHeaders(snapshot));
      return;
    }

    if (req.method === "POST") {
      if (isAutosavePaused()) {
        send(res, 423, JSON.stringify({ ok: false, paused: true, error: "Autosave is paused" }));
        return;
      }
      const body = await readBody(req);
      const currentSnapshot = readAutosaveSnapshot();
      const baseSavedAt = String(req.headers["x-ba-flow-base-savedat"] || "");
      if (currentSnapshot.exists && currentSnapshot.savedAt && baseSavedAt !== currentSnapshot.savedAt) {
        send(res, 409, JSON.stringify({
          ok: false,
          conflict: true,
          error: baseSavedAt ? "Autosave base is stale" : "Autosave base is missing; reload required",
          currentSavedAt: currentSnapshot.savedAt,
          currentHash: currentSnapshot.hash
        }), "application/json", snapshotHeaders(currentSnapshot));
        return;
      }
      const parsed = normalizePayload(JSON.parse(body));
      const pretty = JSON.stringify(parsed, null, 2);
      fs.writeFileSync(autosavePath, `${pretty}\n`, "utf8");
      const nextSnapshot = readAutosaveSnapshot();
      send(res, 200, JSON.stringify({
        ok: true,
        autosavePath,
        bytes: Buffer.byteLength(pretty, "utf8"),
        savedAt: nextSnapshot.savedAt,
        hash: nextSnapshot.hash
      }), "application/json", snapshotHeaders(nextSnapshot));
      return;
    }

    send(res, 405, JSON.stringify({ ok: false, error: "Method not allowed" }));
  } catch (error) {
    send(res, 500, JSON.stringify({ ok: false, error: error.message }));
  }
});

server.listen(port, host, () => {
  console.log(`Swimlane autosave server listening at http://${host}:${port}`);
  console.log(`Autosave file: ${autosavePath}`);
});
