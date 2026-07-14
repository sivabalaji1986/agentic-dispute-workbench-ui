# Screenshots

Captured live from the running app in mock mode (`npm run dev`, default
`VITE_MOCK=true`), not mockups. Referenced from the root `README.md`.

| File                            | What it shows                                                                                                                                     | How to recapture                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `three-zone-parallel-phase.png` | Full three-zone view mid-parallel-phase: Case Review and Policy Agent lines interleaving on the ledger while Orchestrator lines run between them. | Click **Review Dispute**, screenshot the whole viewport ~4s later, before the decision view renders.           |
| `decision-card.png`             | The `DecisionCard` alone, cropped tight — used for the "this JSON becomes this UI" pairing in the AG-UI/A2UI section.                             | Let the review run finish (~10s after submission), screenshot the card element in the decision panel.          |
| `approval-preview.png`          | `ApprovalPreview` — the amber approval gate, Approve as the app's one solid-fill button.                                                          | Click **Create Evidence Request Task**, screenshot the card.                                                   |
| `task-created.png`              | `TaskCreatedCard` — the green committed state.                                                                                                    | Click **Approve Task Creation**, wait for the write-phase progress lines to finish (~2s), screenshot the card. |

If the visual design changes, recapture all four — a stale screenshot next to
current code is worse than no screenshot.
