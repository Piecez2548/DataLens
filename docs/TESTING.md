# Release test checklist

Automated checks run on every push and pull request through GitHub Actions.

## Manual acceptance

- Open Nexus, sign in, and choose DataLens from the project hub.
- Confirm production offers only file upload and does not preload or offer fictional business data.
- For developer regression only, upload `samples/demo.csv`: expect 164 rows, 6 columns, 5 missing cells, 4 duplicates and 99.20 overall score. Never cite these fictional values as business evidence.
- Confirm the Executive brief reports the risks, impact, and recommended next action before the detail metrics.
- Export the executive brief, open the HTML file, and use Print / Save PDF; confirm dataset metadata, scores, findings, signals, and decision limits are present.
- Confirm the page and exported report show the same SHA-256 fingerprint, input size, analyzed rows, method version, and source classification.
- Upload a headerless CSV: expect every row to remain, generated `column_1…n` names, and `Review needed` even when the quality score is 100.
- Give generated columns unique names, override an ID and email type, choose **Apply schema**, and confirm all source rows remain.
- Use **Use first row as header** and confirm the dataset is reanalyzed with one fewer data row.
- Open Data quality: `date` has one invalid date; `units` has one type mismatch.
- Upload an email column containing an invalid address and confirm Validity falls below 100.
- Upload a CSV whose column name and values contain repeated `|` table delimiters; confirm the score can remain 100 while executive status changes to `Review needed`.
- Upload numeric columns with an extreme value and a related pair; confirm the IQR outlier count and correlation signal appear.
- Upload a mostly constant numeric column whose Q1 and Q3 are equal; confirm minority values outside that collapsed Tukey fence are still flagged.
- Explore `units` and `region`: verify histogram and category bars; verify donut and scatter.
- Preview: navigate forward/back; blank revenue displays an em dash.
- Upload a UTF-8 CSV containing quoted commas and blank cells.
- Upload an invalid CSV and a file above 4 MiB: verify a clear error and that the prior dataset remains usable.
- Toggle dark/light mode and repeat at mobile width.
- Choose Back to Nexus; verify the hub opens without transferring CSV contents or credentials.

DataLens uses a separate origin. Nexus authentication is not shared with it; no single sign-on or personal data synchronization is implemented.
