# JSON Format

Developer: Jimmy C

The tool stores one document with multiple swimlane flows. The same shape is used by export, autosave, and update scripts.

## Top-Level Shape

```json
{
  "doc": {},
  "flows": [],
  "activeFlowId": "flow-1",
  "fontSizeMode": "medium",
  "savedAt": "2026-01-01T00:00:00.000Z"
}
```

## Document Fields

Common `doc` fields:

- `tool`: tool identifier.
- `developer`: developer name.
- `featureName`: document title.
- `status`: document status.
- `background`: context shown in the side panel.
- `includeScope`: included scope.
- `excludeScope`: excluded scope.
- `confirmItems`: open confirmation items.
- `assumptions`: assumptions or notes.

Each flow can also include its own `doc` object. Flow-level doc content should describe only that flow.

## Flow Fields

```json
{
  "id": "flow-1",
  "name": "Example flow",
  "version": "Draft",
  "doc": {},
  "nodes": [],
  "edges": []
}
```

`version` is free text in JSON, but the UI is designed around `Draft` and `Confirmed` style states. If your team uses another language, keep the value set small and consistent.

## Node Fields

```json
{
  "id": "N1",
  "type": "baNode",
  "position": { "x": 40, "y": 88 },
  "data": {
    "lane": "Requester",
    "kind": "start",
    "title": "Submit request",
    "desc": "Requester fills the form.",
    "constraint": "Required fields must be complete.",
    "width": 344,
    "height": 176
  }
}
```

Recommended `kind` values:

- `start`
- `task`
- `form`
- `decision`
- `record`
- `system`
- `end`
- `note`

## Edge Fields

```json
{
  "id": "N1-N2",
  "source": "N1",
  "target": "N2",
  "label": "Submitted",
  "type": "cleanStep",
  "sourceHandle": "right-2",
  "targetHandle": "left-2"
}
```

Supported connection handles:

- `top-1`, `top-2`, `top-3`
- `right-1`, `right-2`, `right-3`
- `bottom-1`, `bottom-2`, `bottom-3`
- `left-1`, `left-2`, `left-3`

Do not reuse the same `nodeId + handleId` combination across edges.

## Autosave Files

When `scripts/autosave-server.js` is running, the server writes:

- `tool-swimlane-diagram.autosave.json`
- `tool-swimlane-diagram.autosave.json.paused` when paused
- temporary or backup files when update scripts run

These files are local working files and should normally stay out of git.
