# Release test checklist

Automated checks run on every push and pull request through GitHub Actions.

## Manual acceptance

- Open Nexus, sign in, and choose DataLens from the project hub.
- Load the sample dataset: expect 164 rows, 6 columns, 5 missing cells, 4 duplicates and 99.20 overall score.
- Confirm the Executive brief reports the risks, impact, and recommended next action before the detail metrics.
- Upload a headerless CSV: expect every row to remain, generated `column_1…n` names, and `Review needed` even when the quality score is 100.
- Use **Use first row as header** and confirm the dataset is reanalyzed with one fewer data row.
- Open Data quality: `date` has one invalid date; `units` has one type mismatch.
- Explore `units` and `region`: verify histogram and category bars; verify donut and scatter.
- Preview: navigate forward/back; blank revenue displays an em dash.
- Upload a UTF-8 CSV containing quoted commas and blank cells.
- Upload an invalid CSV and a file above 4 MiB: verify a clear error and that the prior dataset remains usable.
- Toggle dark/light mode and repeat at mobile width.
- Choose Back to Nexus; verify the hub opens without transferring CSV contents or credentials.

DataLens uses a separate origin. Nexus authentication is not shared with it; no single sign-on or personal data synchronization is implemented.
