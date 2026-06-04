# _client/

Client reference documents — committed with the project so they live alongside the code.

## Expected files

| Filename                 | Source                          | Used by        |
|--------------------------|---------------------------------|----------------|
| `master_brief.html`      | Master Brief Generator output   | Copied to _build/ on kickoff |
| `master_brief.pdf`       | Alternative if PDF format       | Copied to _build/ on kickoff |

## How to add the master brief

1. Run the Master Brief Generator for this client
2. Save the output as `_client/master_brief.html` (or `.pdf`)
3. Re-run kickoff, or just copy it manually to `_build/` — it will be linked
   from the launch readiness checker

Any filename starting with `master_brief` is detected automatically.
