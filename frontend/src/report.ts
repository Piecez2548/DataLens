import type { Analysis, AuditEvent } from "./types";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const number = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function downloadExecutiveReport(data: Analysis, auditEvents: AuditEvent[]) {
  const generatedAt = new Date().toLocaleString();
  const scoreCards = Object.entries(data.scores)
    .map(
      ([label, score]) => `
        <article class="score-card">
          <span>${escapeHtml(label)}</span>
          <strong>${score === null ? "N/A" : `${number(score)}%`}</strong>
        </article>`,
    )
    .join("");
  const issues = data.executive.issues.length
    ? data.executive.issues
        .map(
          (issue) => `
          <article class="issue">
            <span class="severity ${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</span>
            <div>
              <h3>${escapeHtml(issue.title)}</h3>
              <p>${escapeHtml(issue.detail)}</p>
              <small><strong>Recommended action:</strong> ${escapeHtml(issue.recommendation)}</small>
            </div>
          </article>`,
        )
        .join("")
    : '<p class="positive">No structural issue was found by the current checks.</p>';
  const signals = data.executive.signals.length
    ? `<ul>${data.executive.signals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join("")}</ul>`
    : "<p>No statistical relationship met the reporting threshold.</p>";
  const outlierRows = data.columns
    .filter((column) => column.outliers > 0)
    .map(
      (column) =>
        `<tr><td>${escapeHtml(column.name)}</td><td>${number(column.outliers)}</td><td>${number(column.stats?.q1 ?? 0)}</td><td>${number(column.stats?.q3 ?? 0)}</td></tr>`,
    )
    .join("");
  const ruleRows = data.business_rules.results
    .map(
      (rule) =>
        `<tr><td>${escapeHtml(rule.column)}</td><td>${escapeHtml(rule.rule)}</td><td>${number(rule.checked)}</td><td>${number(rule.violations)}</td></tr>`,
    )
    .join("");
  const auditRows = auditEvents
    .map(
      (event) =>
        `<tr><td>${escapeHtml(event.action)}</td><td>${escapeHtml(new Date(event.timestamp * 1000).toISOString())}</td><td>${escapeHtml(event.actor_role)}</td><td><code>${escapeHtml(event.signature.slice(0, 16))}…</code></td></tr>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>DataLens executive brief · ${escapeHtml(data.filename)}</title>
<style>
:root{font-family:Inter,Arial,sans-serif;color:#20222d;background:#f5f6f9}*{box-sizing:border-box}body{margin:0}.page{max-width:980px;margin:32px auto;background:#fff;padding:48px;border:1px solid #e2e4eb;border-radius:12px}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #625de0;padding-bottom:24px}.brand{color:#625de0;font-weight:800;letter-spacing:.08em}.meta{text-align:right;color:#717687;font-size:12px}h1{font-size:34px;margin:10px 0 5px}h2{font-size:19px;margin:32px 0 14px}h3{font-size:14px;margin:0 0 6px}p,li,small{color:#626777;line-height:1.6}.summary{font-size:17px;max-width:720px}.dataset{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.dataset div,.score-card{border:1px solid #e2e4eb;border-radius:8px;padding:16px}.dataset span,.score-card span{display:block;color:#717687;font-size:11px;text-transform:uppercase;letter-spacing:.07em}.dataset strong,.score-card strong{display:block;margin-top:7px;font-size:22px}.scores{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.score-card strong{font-size:20px}.issue{display:flex;gap:12px;border-top:1px solid #e2e4eb;padding:16px 0}.severity{height:max-content;padding:4px 7px;border-radius:4px;background:#ececfd;color:#514cc6;font-size:9px;font-weight:700;text-transform:uppercase}.severity.high{background:#fbe7e9;color:#ad3944}.severity.medium{background:#fff3d8;color:#8b640f}.issue p{margin:0 0 4px}.positive{color:#247c68}.method{background:#f5f6f9;padding:18px;border-radius:8px;font-size:12px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e2e4eb}th{color:#717687}.print{position:fixed;right:24px;top:24px;padding:11px 16px;border:0;border-radius:7px;background:#625de0;color:#fff;font-weight:700;cursor:pointer}@media print{body{background:#fff}.page{margin:0;border:0;padding:24px}.print{display:none}}@media(max-width:700px){.page{margin:0;padding:24px;border:0}.scores{grid-template-columns:repeat(2,1fr)}.dataset{grid-template-columns:1fr}.top{display:block}.meta{text-align:left;margin-top:14px}.print{position:static;margin:16px 24px 0}}
</style></head><body><button class="print" onclick="window.print()">Print / Save PDF</button><main class="page">
<header class="top"><div><div class="brand">DATALENS</div><h1>Executive data brief</h1><p>${escapeHtml(data.filename)}</p></div><div class="meta">Generated ${escapeHtml(generatedAt)}<br>Session-only analysis</div></header>
<section><h2>Evidence provenance</h2><div class="method"><strong>Uploaded source file</strong><br>All metrics below were deterministically calculated from the named CSV. Data rows and values were not generated by DataLens.<br>SHA-256: ${escapeHtml(data.provenance.sha256)}<br>Input: ${number(data.provenance.input_bytes)} bytes · ${number(data.provenance.file_rows)} parsed file rows · ${number(data.provenance.analyzed_rows)} analyzed rows · Method v${escapeHtml(data.provenance.method_version)}</div></section>
<section><h2>Governance declaration</h2><div class="method">Analysis ID: ${escapeHtml(data.governance.analysis_id)}<br>Owner: ${escapeHtml(data.governance.declared.owner || "Not declared")}<br>Classification: ${escapeHtml(data.governance.declared.classification || "Not declared")}<br>Source: ${escapeHtml(data.governance.declared.source_url || "Not declared")}<br>Source verified: ${escapeHtml(data.governance.declared.verified_at || "Not declared")}<br>Purpose: ${escapeHtml(data.governance.declared.purpose || "Not declared")}<br>Retention: request only · Server storage: none</div></section>
<section><h2>${escapeHtml(data.executive.status)}</h2><p class="summary">${escapeHtml(data.executive.message)}</p><div class="dataset"><div><span>Rows</span><strong>${number(data.rows)}</strong></div><div><span>Columns</span><strong>${number(data.column_count)}</strong></div><div><span>Items to review</span><strong>${number(data.executive.issue_count)}</strong></div></div></section>
<section><h2>Quality scorecard</h2><div class="scores">${scoreCards}</div></section>
<section><h2>Priority findings</h2>${issues}</section>
<section><h2>Analytical signals</h2>${signals}</section>
${outlierRows ? `<section><h2>Potential outliers</h2><table><thead><tr><th>Column</th><th>Count</th><th>Q1</th><th>Q3</th></tr></thead><tbody>${outlierRows}</tbody></table></section>` : ""}
${ruleRows ? `<section><h2>Business validation rules</h2><table><thead><tr><th>Column</th><th>Rule</th><th>Checked</th><th>Violations</th></tr></thead><tbody>${ruleRows}</tbody></table></section>` : ""}
<section><h2>Signed audit trail</h2>${auditRows ? `<table><thead><tr><th>Event</th><th>UTC timestamp</th><th>Role</th><th>HMAC-SHA256 signature</th></tr></thead><tbody>${auditRows}</tbody></table>` : "<p>No audit event was recorded.</p>"}<p>Signatures can be verified only by the DataLens service owner who controls the signing secret. This exported brief is the portable audit record; DataLens does not retain it on the server.</p></section>
<section><h2>Decision note</h2><p class="method">${escapeHtml(data.executive.scope_note)} Correlations use complete finite numeric pairs and do not establish causation. Potential outliers use the 1.5×IQR rule. Validate findings against business definitions before making material decisions.</p></section>
</main></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = data.filename
    .replace(/\.csv$/i, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  link.href = url;
  link.download = `${safeName || "dataset"}-executive-brief.html`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
