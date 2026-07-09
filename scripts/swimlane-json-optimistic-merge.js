const fs = require("fs");
const crypto = require("crypto");

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameValue(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function hash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else if (args[key]) {
      args[key] = Array.isArray(args[key]) ? args[key].concat(next) : [args[key], next];
      i += 1;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function pathJoin(parent, key) {
  return parent ? `${parent}.${key}` : key;
}

function flattenLeaves(value, prefix = "", result = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenLeaves(item, `${prefix}[${index}]`, result));
    if (value.length === 0) result.set(prefix, []);
    return result;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) result.set(prefix, {});
    keys.forEach((key) => flattenLeaves(value[key], pathJoin(prefix, key), result));
    return result;
  }
  result.set(prefix, value);
  return result;
}

function setByPath(root, path, value) {
  const parts = [];
  path.split(".").forEach((part) => {
    const matches = [...part.matchAll(/([^\[\]]+)|\[(\d+)\]/g)];
    matches.forEach((match) => parts.push(match[1] ?? Number(match[2])));
  });
  let current = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = clone(value);
}

function diffLeaves(base, candidate) {
  const baseLeaves = flattenLeaves(base);
  const candidateLeaves = flattenLeaves(candidate);
  const paths = new Set([...baseLeaves.keys(), ...candidateLeaves.keys()]);
  return [...paths].filter((path) => !sameValue(baseLeaves.get(path), candidateLeaves.get(path)));
}

function mergeLeafObject(baseObj, candidateObj, liveObj, label, conflicts) {
  const merged = clone(liveObj ?? {});
  for (const path of diffLeaves(baseObj ?? {}, candidateObj ?? {})) {
    const baseLeaves = flattenLeaves(baseObj ?? {});
    const candidateLeaves = flattenLeaves(candidateObj ?? {});
    const liveLeaves = flattenLeaves(liveObj ?? {});
    const baseValue = baseLeaves.get(path);
    const candidateValue = candidateLeaves.get(path);
    const liveValue = liveLeaves.get(path);
    if (!sameValue(liveValue, baseValue) && !sameValue(liveValue, candidateValue)) {
      conflicts.push(`${label}.${path}`);
      continue;
    }
    setByPath(merged, path, candidateValue);
  }
  return merged;
}

function byId(items) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item]));
}

function removeById(items, id) {
  return (Array.isArray(items) ? items : []).filter((item) => item.id !== id);
}

function upsertPreserveOrder(items, item) {
  const list = Array.isArray(items) ? items.slice() : [];
  const index = list.findIndex((current) => current.id === item.id);
  if (index >= 0) list[index] = item;
  else list.push(item);
  return list;
}

function mergeCollectionById(baseItems, candidateItems, liveItems, label, conflicts) {
  let mergedItems = Array.isArray(liveItems) ? clone(liveItems) : [];
  const baseMap = byId(baseItems);
  const candidateMap = byId(candidateItems);
  const liveMap = byId(liveItems);
  const ids = new Set([...baseMap.keys(), ...candidateMap.keys()]);

  for (const id of ids) {
    const baseItem = baseMap.get(id);
    const candidateItem = candidateMap.get(id);
    const liveItem = liveMap.get(id);

    if (!baseItem && candidateItem) {
      if (liveItem && !sameValue(liveItem, candidateItem)) {
        conflicts.push(`${label}[${id}]`);
      } else if (!liveItem) {
        mergedItems.push(clone(candidateItem));
      }
      continue;
    }

    if (baseItem && !candidateItem) {
      if (!liveItem) continue;
      if (!sameValue(liveItem, baseItem)) {
        conflicts.push(`${label}[${id}]`);
      } else {
        mergedItems = removeById(mergedItems, id);
      }
      continue;
    }

    if (!sameValue(baseItem, candidateItem)) {
      if (!liveItem) {
        conflicts.push(`${label}[${id}]`);
        continue;
      }
      const mergedItem = mergeLeafObject(baseItem, candidateItem, liveItem, `${label}[${id}]`, conflicts);
      mergedItems = upsertPreserveOrder(mergedItems, mergedItem);
    }
  }
  return mergedItems;
}

function mergeFlow(baseFlow, candidateFlow, liveFlow, conflicts) {
  const mergedFlow = clone(liveFlow);
  const baseRest = clone(baseFlow);
  const candidateRest = clone(candidateFlow);
  const liveRest = clone(liveFlow);
  delete baseRest.nodes;
  delete baseRest.edges;
  delete candidateRest.nodes;
  delete candidateRest.edges;
  delete liveRest.nodes;
  delete liveRest.edges;

  Object.assign(mergedFlow, mergeLeafObject(baseRest, candidateRest, liveRest, `flows[${candidateFlow.id}]`, conflicts));
  mergedFlow.nodes = mergeCollectionById(baseFlow.nodes, candidateFlow.nodes, liveFlow.nodes, `flows[${candidateFlow.id}].nodes`, conflicts);
  mergedFlow.edges = mergeCollectionById(baseFlow.edges, candidateFlow.edges, liveFlow.edges, `flows[${candidateFlow.id}].edges`, conflicts);
  return mergedFlow;
}

function mergeTopLevel(base, candidate, live, merged, conflicts) {
  const baseDoc = base.doc || {};
  const candidateDoc = candidate.doc || {};
  const liveDoc = live.doc || {};
  if (!sameValue(baseDoc, candidateDoc)) {
    merged.doc = mergeLeafObject(baseDoc, candidateDoc, liveDoc, "doc", conflicts);
  }
  for (const key of ["fontSizeMode"]) {
    if (!sameValue(base[key], candidate[key])) {
      if (!sameValue(live[key], base[key]) && !sameValue(live[key], candidate[key])) {
        conflicts.push(key);
      } else {
        merged[key] = clone(candidate[key]);
      }
    }
  }
}

function changedExistingFlowIds(base, candidate) {
  const candidateMap = byId(candidate.flows);
  return (base.flows || [])
    .filter((baseFlow) => candidateMap.has(baseFlow.id) && !sameValue(baseFlow, candidateMap.get(baseFlow.id)))
    .map((flow) => flow.id);
}

function newFlowIds(base, candidate) {
  const baseIds = new Set((base.flows || []).map((flow) => flow.id));
  return (candidate.flows || []).filter((flow) => !baseIds.has(flow.id)).map((flow) => flow.id);
}

function mergeDocuments({ base, candidate, live, mode, targetFlowIds, setActiveFlow }) {
  const conflicts = [];
  const merged = clone(live);
  mergeTopLevel(base, candidate, live, merged, conflicts);

  const baseFlowMap = byId(base.flows);
  const candidateFlowMap = byId(candidate.flows);
  const liveFlowMap = byId(live.flows);

  let flowIds = targetFlowIds.length ? targetFlowIds : changedExistingFlowIds(base, candidate);
  const addedFlowIds = newFlowIds(base, candidate);

  if (mode === "add-flow") {
    for (const flowId of addedFlowIds) {
      if (liveFlowMap.has(flowId)) {
        conflicts.push(`flows[${flowId}] already exists in live`);
      } else {
        merged.flows = upsertPreserveOrder(merged.flows, candidateFlowMap.get(flowId));
      }
    }
    flowIds = flowIds.filter((flowId) => baseFlowMap.has(flowId));
  } else if (addedFlowIds.length) {
    conflicts.push(`update-flow cannot add flows: ${addedFlowIds.join(",")}`);
  }

  for (const flowId of flowIds) {
    const baseFlow = baseFlowMap.get(flowId);
    const candidateFlow = candidateFlowMap.get(flowId);
    const liveFlow = liveFlowMap.get(flowId);
    if (!baseFlow || !candidateFlow || !liveFlow) {
      conflicts.push(`flows[${flowId}] missing in base/candidate/live`);
      continue;
    }
    const mergedFlow = mergeFlow(baseFlow, candidateFlow, liveFlow, conflicts);
    merged.flows = upsertPreserveOrder(merged.flows, mergedFlow);
  }

  if (setActiveFlow === "candidate") {
    if (candidate.activeFlowId && merged.flows.some((flow) => flow.id === candidate.activeFlowId)) {
      merged.activeFlowId = candidate.activeFlowId;
    } else {
      conflicts.push("activeFlowId candidate target missing");
    }
  } else if (setActiveFlow && setActiveFlow !== "none") {
    if (merged.flows.some((flow) => flow.id === setActiveFlow)) {
      merged.activeFlowId = setActiveFlow;
    } else {
      conflicts.push(`activeFlowId target missing: ${setActiveFlow}`);
    }
  }

  merged.savedAt = new Date().toISOString();
  return { merged, conflicts };
}

function assertUniqueHandles(flow) {
  const seen = new Map();
  for (const edge of flow.edges || []) {
    for (const [nodeId, handleId, end] of [
      [edge.source, edge.sourceHandle, "source"],
      [edge.target, edge.targetHandle, "target"]
    ]) {
      const key = `${nodeId}:${handleId}`;
      if (seen.has(key)) {
        const first = seen.get(key);
        throw new Error(`Duplicate handle ${flow.id} ${key}: ${first.edgeId}/${first.end} and ${edge.id}/${end}`);
      }
      seen.set(key, { edgeId: edge.id, end });
    }
  }
}

function assertNoHumanToPersistent(flow) {
  const nodesById = new Map((flow.nodes || []).map((node) => [node.id, node]));
  const peopleGroups = new Set(["people", "person", "human", "actor", "requester"]);
  const recordGroups = new Set(["record", "records", "data", "database", "persistent"]);
  const groupOf = (node) => String(node?.data?.laneGroup || node?.data?.group || "").trim().toLowerCase();
  for (const edge of flow.edges || []) {
    const sourceGroup = groupOf(nodesById.get(edge.source));
    const targetGroup = groupOf(nodesById.get(edge.target));
    if (peopleGroups.has(sourceGroup) && recordGroups.has(targetGroup)) {
      throw new Error(`Human node ${edge.source} connects directly to persistent lane node ${edge.target} in ${flow.id}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const key of ["base", "candidate", "live", "out", "mode"]) {
    if (!args[key]) throw new Error(`Missing --${key}`);
  }
  if (!["add-flow", "update-flow"].includes(args.mode)) {
    throw new Error("--mode must be add-flow or update-flow");
  }

  const targetFlowIds = args["target-flow-id"]
    ? (Array.isArray(args["target-flow-id"]) ? args["target-flow-id"] : [args["target-flow-id"]])
    : [];
  const base = readJson(args.base);
  const candidate = readJson(args.candidate);
  const live = readJson(args.live);
  const { merged, conflicts } = mergeDocuments({
    base,
    candidate,
    live,
    mode: args.mode,
    targetFlowIds,
    setActiveFlow: args["set-active-flow"] || "none"
  });

  if (conflicts.length) {
    const error = new Error(`Optimistic merge conflict: ${conflicts.join("; ")}`);
    error.conflicts = conflicts;
    throw error;
  }

  const validationFlowIds = new Set([
    ...targetFlowIds,
    ...newFlowIds(base, candidate),
    ...changedExistingFlowIds(base, candidate)
  ]);
  for (const flow of merged.flows || []) {
    if (!validationFlowIds.has(flow.id)) continue;
    assertUniqueHandles(flow);
    assertNoHumanToPersistent(flow);
  }
  writeJson(args.out, merged);
  process.stdout.write(JSON.stringify({
    ok: true,
    mode: args.mode,
    baseHash: hash(base),
    candidateHash: hash(candidate),
    liveHash: hash(live),
    outputHash: hash(merged),
    targetFlowIds,
    addedFlowIds: newFlowIds(base, candidate)
  }));
}

main();
