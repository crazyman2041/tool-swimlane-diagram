# tool-swimlane-diagram

一個可直接用瀏覽器開啟的單頁泳道圖工具，也提供本機 autosave server 與 JSON 更新腳本，方便開發者或 coding agent 安全修改流程圖資料。

Developer: Jimmy C

## 功能

- 新增、拖曳、編輯、刪除流程節點
- 從節點的所屬泳道下拉選單新增自訂泳道分類與泳道名稱
- 復原 / 取消復原與操作記錄
- Tab 順序支援載入、版本顯示、模糊搜尋與小圖示排序
- 建立節點連線與連線文字
- 匯出與匯入 JSON
- 使用瀏覽器 localStorage 暫存目前編輯狀態
- 可選擇啟動本機 autosave server，把 JSON 寫到 repo 根目錄
- 提供 optimistic JSON merge 腳本，降低開著頁面時直接改 JSON 的覆蓋風險

## 使用方式

最簡單的方式是直接開啟 `index.html`。範例資料為通用「請假申請流程」，不包含任何特定專案資料。

若要讓開發者或 agent 能安全修改同一份 JSON，先啟動本機 autosave server：

```powershell
node .\scripts\autosave-server.js
```

再開啟 `index.html`，工具會優先使用：

```text
tool-swimlane-diagram.autosave.json
```

沒有啟動 server 時，工具仍可用瀏覽器支援的本機儲存機制與手動匯出 JSON。

## 開發者更新 JSON

先建立或取得 `tool-swimlane-diagram.autosave.json`，再執行 updater：

```powershell
.\scripts\update-swimlane-json-optimistic.ps1 -Mode UpdateFlow -TargetFlowId flow-1 -UpdaterJs scripts\updaters\example-rename-flow.js
```

若 Windows 擋下未簽章 PowerShell 腳本，改用：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-swimlane-json-optimistic.ps1 -Mode UpdateFlow -TargetFlowId flow-1 -UpdaterJs scripts\updaters\example-rename-flow.js
```

新增流程範例：

```powershell
.\scripts\update-swimlane-json-optimistic.ps1 -Mode AddFlow -UpdaterJs scripts\updaters\example-add-flow.js
```

更多規則見 `docs/DEVELOPER_WORKFLOW.md`。

## 檔案

- `index.html`：泳道圖工具
- `sample-flow.json`：可匯入的通用範例流程
- `docs/SWIMLANE_STANDARD.md`：通用泳道圖規範與自檢清單
- `docs/JSON_FORMAT.md`：JSON 資料格式說明
- `docs/DEVELOPER_WORKFLOW.md`：開發者與 agent 更新流程
- `scripts/autosave-server.js`：本機 JSON autosave server
- `scripts/update-swimlane-json-optimistic.ps1`：三方合併更新腳本
- `scripts/update-swimlane-json-safely.ps1`：暫停 autosave 後更新的 fallback 腳本
- `scripts/swimlane-json-optimistic-merge.js`：field-level merge 工具
- `scripts/updaters/`：通用 updater 範例
- `LICENSE`：MIT License

## 功能迭代紀錄

### 2026-07-09

- 補齊通用泳道圖規範、JSON 格式說明與開發者更新流程。
- 新增本機 autosave server、optimistic merge 腳本、安全更新腳本與 updater 範例。
- 前端支援 server 模式的 savedAt/hash 衝突保護。

### 2026-07-08

- 新增復原 / 取消復原與最近操作記錄。
- Tab 順序清單新增版本顯示、點選載入、模糊搜尋與小圖示排序按鈕。
- 所屬泳道下拉選單支援新增泳道分類、泳道名稱，以及逐項刪除泳道。
