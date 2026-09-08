import type { Analysis, AuditEvent, BusinessRule } from "./types";

export type GovernanceInput = {
  owner: string;
  source_url: string;
  verified_at: string;
  classification: "public" | "internal" | "confidential";
  purpose: string;
};

export function UploadPolicy({
  value,
  authorized,
  ready,
  onChange,
  onAuthorized,
}: {
  value: GovernanceInput;
  authorized: boolean;
  ready: boolean;
  onChange: (value: GovernanceInput) => void;
  onAuthorized: (value: boolean) => void;
}) {
  return (
    <section className="panel upload-policy">
      <div><span className="eyebrow">DATA GOVERNANCE</span><h2>Declare the source before upload</h2><p>These fields travel with the analysis record; CSV values are discarded after the request.</p></div>
      <div className="governance-fields">
        <label>Data owner <span className="required-mark">Required</span><input required value={value.owner} maxLength={120} onChange={(e) => onChange({ ...value, owner: e.target.value })} placeholder="Team or accountable owner" /></label>
        <label>Classification<select value={value.classification} onChange={(e) => onChange({ ...value, classification: e.target.value as GovernanceInput["classification"] })}><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option></select></label>
        <label>Source URL (HTTPS) <span className="optional-mark">Optional</span><input type="url" value={value.source_url} onChange={(e) => onChange({ ...value, source_url: e.target.value })} placeholder="https://official-source.example" /></label>
        <label>Source verified on <span className="optional-mark">Optional</span><input type="date" value={value.verified_at} onChange={(e) => onChange({ ...value, verified_at: e.target.value })} /></label>
        <label className="wide">Purpose <span className="required-mark">Required</span><input required value={value.purpose} maxLength={200} onChange={(e) => onChange({ ...value, purpose: e.target.value })} placeholder="Decision or report this analysis supports" /></label>
      </div>
      <label className="authorization"><input type="checkbox" checked={authorized} onChange={(e) => onAuthorized(e.target.checked)} /> I am authorized to process this file under the selected classification.</label>
      <p className={`upload-readiness ${ready ? "ready" : ""}`} role="status" aria-live="polite">
        {ready
          ? "Ready to upload. Choose a CSV file to begin analysis."
          : "Enter the data owner and purpose, then confirm your authorization to enable upload."}
      </p>
    </section>
  );
}

export function GovernancePanel({
  data,
  rules,
  auditEvents,
  busy,
  canApprove,
  onRule,
  onApplyRules,
  onAudit,
}: {
  data: Analysis;
  rules: Record<string, BusinessRule>;
  auditEvents: AuditEvent[];
  busy: boolean;
  canApprove: boolean;
  onRule: (column: string, rule: BusinessRule) => void;
  onApplyRules: () => void;
  onAudit: (action: "review" | "approve", note: string) => void;
}) {
  return (
    <section className="panel governance-panel">
      <div className="section-title"><div><span className="eyebrow">CONTROL & APPROVAL</span><h2>Evidence, rules, and sign-off</h2><p>Audit events contain metadata only and are signed by the server.</p></div><span className="badge">{data.governance.actor_role}</span></div>
      <div className="governance-summary">
        <div><span>Analysis ID</span><strong>{data.governance.analysis_id.slice(0, 12)}…</strong></div>
        <div><span>Retention</span><strong>Request only</strong></div>
        <div><span>Server storage</span><strong>None</strong></div>
        <div><span>Classification</span><strong>{data.governance.declared.classification || "Not declared"}</strong></div>
        <div><span>Data owner</span><strong>{data.governance.declared.owner || "Not declared"}</strong></div>
        <div><span>Source verified</span><strong>{data.governance.declared.verified_at || "Not declared"}</strong></div>
      </div>
      <details>
        <summary>Configure business validity rules</summary>
        <div className="rule-grid">
          {data.columns.map((column) => {
            const rule = rules[column.name] ?? {};
            return <div className="rule-row" key={column.name}><strong>{column.name}</strong><label><input type="checkbox" checked={Boolean(rule.required)} onChange={(e) => onRule(column.name, { ...rule, required: e.target.checked })} /> Required</label>{column.type === "numeric" && <><label>Min<input type="number" value={rule.min ?? ""} onChange={(e) => onRule(column.name, { ...rule, min: e.target.value === "" ? undefined : Number(e.target.value) })} /></label><label>Max<input type="number" value={rule.max ?? ""} onChange={(e) => onRule(column.name, { ...rule, max: e.target.value === "" ? undefined : Number(e.target.value) })} /></label></>}<label className="wide">Allowed values<input value={rule.allowed_values?.join(", ") ?? ""} onChange={(e) => onRule(column.name, { ...rule, allowed_values: e.target.value ? e.target.value.split(",").map((item) => item.trim()).filter(Boolean) : undefined })} placeholder="Optional, comma separated" /></label></div>;
          })}
        </div>
        <button className="primary" disabled={busy} onClick={onApplyRules}>Apply rules and reanalyze</button>
      </details>
      {data.business_rules.configured && <p className={data.business_rules.passed ? "governance-pass" : "governance-fail"}>{data.business_rules.passed ? "All configured business rules passed." : `${data.business_rules.total_violations} rule violations require resolution.`}</p>}
      <AuditControls events={auditEvents} canApprove={canApprove} onAudit={onAudit} />
    </section>
  );
}

function AuditControls({ events, canApprove, onAudit }: { events: AuditEvent[]; canApprove: boolean; onAudit: (action: "review" | "approve", note: string) => void }) {
  const latest = events.at(-1);
  return <div className="audit-controls"><div><strong>Signed audit trail</strong><p>{events.length} event(s) · latest: {latest?.action ?? "none"}</p></div><button onClick={() => onAudit("review", "Evidence and configured rules reviewed.")}>Mark reviewed</button><button className="primary" disabled={!canApprove} title={canApprove ? "" : "Approver or admin role required"} onClick={() => onAudit("approve", "Approved for executive use.")}>Approve for executive use</button></div>;
}
