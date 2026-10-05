# Practice backlog

Use these as Jira-style stories in short learning sprints. No Jira account or external tickets are created.

| Story | User need | Acceptance criteria |
| --- | --- | --- |
| PEN-101 — Member search | Staff finds the correct member | Search by name/number; paginate; display employer/status; no real data |
| PEN-102 — Atomic contribution import | Staff safely receives payroll | All rows validate before posting; row errors persist; duplicates never earn extra service |
| PEN-103 — Benefit snapshot | Staff explains a calculation | Age/service boundaries tested; latest 36 months used; rule version and inputs retained |
| PEN-104 — Independent decision | Approver reviews retirement | Staff cannot approve; self-review denied; stale versions fail; approval retires member atomically |
| PEN-105 — Member report | Staff provides a readable summary | Saved estimate and current totals labeled separately; Jasper PDF text and rendering checked |
| PEN-106 — Audited recovery (extension) | Operator recovers an interrupted batch | Privileged role; reconcile first; preserve fingerprint; explicit restart eligibility; audit every restart |
| PEN-107 — Adjustments (extension) | Staff corrects a posted amount | Reversal plus replacement; no destructive ledger edits; new estimates reflect net adjustment |
| PEN-108 — Cloud identity (extension) | Staff uses organizational login | OIDC login; group-to-role mapping; demo profile absent; authorization regression tests |

## Debugging exercises

1. Change one CSV amount to `5000.001`. Explain why the whole file is rejected while valid-row diagnostics remain visible.
2. Save Alex's ineligible estimate, import December, then compare old and new snapshots. Trace why the first one never changes.
3. Open the same submitted request in two sessions and make competing decisions. Identify the version predicate and transaction preventing two approvals.
4. Change the cap in a working copy of `BenefitCalculator`. Write a test that fails under the old rule and introduce a new rule version instead of relabeling past estimates.
5. Add a month with a salary spike. Use SQL to identify which 36 months enter the calculation; compare with the saved JSON inputs.
6. Modify report spacing in Studio, run `ReportTest`, then visually inspect the rendered page before considering the change complete.

For each story, explain the business outcome during grooming, identify a boundary case, implement the smallest complete change, review its transaction/security impact, and demonstrate it at sprint review. The pull-request template provides a starting checklist.
