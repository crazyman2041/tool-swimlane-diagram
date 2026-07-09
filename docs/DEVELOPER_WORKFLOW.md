# Developer Workflow

Developer: Jimmy C

This guide is for developers or coding agents who need to update swimlane JSON without manually editing the full file.

## Basic Usage

Open `index.html` directly in a browser for simple use.

For safer agent/developer updates, start the local autosave server:

```powershell
node .\scripts\autosave-server.js
```

Then open `index.html`. The page will prefer the local server and write to:

```text
tool-swimlane-diagram.autosave.json
```

If the server is not running, the page falls back to browser-supported persistent storage where available.

## Updating JSON With Scripts

Create a small updater script that receives the JSON path as `process.argv[2]`. The updater should be idempotent and narrowly scoped.

Example:

```powershell
.\scripts\update-swimlane-json-optimistic.ps1 -Mode UpdateFlow -TargetFlowId flow-1 -UpdaterJs scripts\updaters\example-rename-flow.js
```

If Windows blocks unsigned PowerShell scripts, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-swimlane-json-optimistic.ps1 -Mode UpdateFlow -TargetFlowId flow-1 -UpdaterJs scripts\updaters\example-rename-flow.js
```

For a new flow:

```powershell
.\scripts\update-swimlane-json-optimistic.ps1 -Mode AddFlow -UpdaterJs scripts\updaters\example-add-flow.js
```

Use `UpdateFlow` for existing flows and pass every affected flow id through `-TargetFlowId`.

## Optimistic Update Discipline

1. Read the latest JSON first.
2. Plan the exact flow, nodes, edges, and doc fields to change.
3. Write a small updater script instead of editing the whole JSON by hand.
4. Run the optimistic updater.
5. Re-read the affected flow.
6. Check connection handle uniqueness.
7. Reload the browser page so the UI picks up the updated JSON.

The optimistic updater does a field-level three-way merge:

- `base`: JSON at updater start.
- `candidate`: updater output.
- `live`: latest JSON after the updater ran.

If the same field changed in both `candidate` and `live`, the script stops with a conflict.

## Fallback Update

Use the safe updater only when the optimistic updater cannot proceed or when you deliberately want a pause/restart window.

```powershell
.\scripts\update-swimlane-json-safely.ps1 -UpdaterJs scripts\updaters\example-rename-flow.js
```

The safe updater pauses autosave, backs up JSON, optionally runs the updater, writes the file, restarts the autosave server, and then unpauses unless `-KeepPaused` is passed.

## What Not To Commit

Do not commit local autosave or backup files:

- `tool-swimlane-diagram.autosave.json`
- `*.paused`
- `*.bak-*`
- `*.optimistic-*.json`
- `*.tmp-*`
