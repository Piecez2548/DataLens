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
  busy,
  saved,
  onChange,
  onAuthorized,
  onSave,
}: {
  value: GovernanceInput;
  authorized: boolean;
  ready: boolean;
  busy: boolean;
  saved: boolean;
  onChange: (value: GovernanceInput) => void;
  onAuthorized: (value: boolean) => void;
  onSave: () => void;
}) {
  return (
    <details className="panel upload-policy">
      <summary className="advanced-summary">
        <span>
          <strong>Prepare an executive report</strong>
          <small>Add the owner and source when this analysis will be shared.</small>
        </span>
        <span className="badge">{saved ? "Details added" : "Optional"}</span>
      </summary>
      <div className="advanced-body">
        <div className="governance-fields">
          <label>
            Data owner <span className="required-mark">Required to save</span>
            <input
              value={value.owner}
              maxLength={120}
              onChange={(event) =>
                onChange({ ...value, owner: event.target.value })
              }
              placeholder="For example, Sales Operations"
            />
          </label>
          <label>
            Data classification
            <select
              value={value.classification}
              onChange={(event) =>
                onChange({
                  ...value,
                  classification: event.target
                    .value as GovernanceInput["classification"],
                })
              }
            >
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
            </select>
          </label>
          <label>
            Official source <span className="optional-mark">Optional</span>
            <input
              type="url"
              value={value.source_url}
              onChange={(event) =>
                onChange({ ...value, source_url: event.target.value })
              }
              placeholder="https://source.example"
            />
          </label>
          <label>
            Source checked on <span className="optional-mark">Optional</span>
            <input
              type="date"
              value={value.verified_at}
              onChange={(event) =>
                onChange({ ...value, verified_at: event.target.value })
              }
            />
          </label>
          <label className="wide">
            Report purpose <span className="required-mark">Required to save</span>
            <input
              value={value.purpose}
              maxLength={200}
              onChange={(event) =>
                onChange({ ...value, purpose: event.target.value })
              }
              placeholder="For example, Monthly sales review"
            />
          </label>
        </div>
        <label className="authorization">
          <input
            type="checkbox"
            checked={authorized}
            onChange={(event) => onAuthorized(event.target.checked)}
          />
          I am allowed to use this file for the stated purpose.
        </label>
        <div className="advanced-actions">
          <p>
            These details are included in the report. DataLens does not retain
            the CSV on its server.
          </p>
          <button className="primary" disabled={busy || !ready} onClick={onSave}>
            {busy ? "Saving…" : saved ? "Update report details" : "Add report details"}
          </button>
        </div>
      </div>
    </details>
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
    <details className="panel governance-panel">
      <summary className="advanced-summary">
        <span>
          <strong>Advanced checks and approval</strong>
          <small>Set business rules or record a formal review.</small>
        </span>
        <span className="badge">Optional</span>
      </summary>
      <div className="advanced-body">
        <div className="governance-summary">
          <div>
            <span>Analysis ID</span>
            <strong>{data.governance.analysis_id.slice(0, 12)}…</strong>
          </div>
          <div>
            <span>File retention</span>
            <strong>Not stored</strong>
          </div>
          <div>
            <span>Access role</span>
            <strong>{data.governance.actor_role}</strong>
          </div>
        </div>
        <details className="rule-editor">
          <summary>Set business rules</summary>
          <p>
            Use these only when your organization has an agreed definition of
            valid values.
          </p>
          <div className="rule-grid">
            {data.columns.map((column) => {
              const rule = rules[column.name] ?? {};
              return (
                <div className="rule-row" key={column.name}>
                  <strong>{column.name}</strong>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(rule.required)}
                      onChange={(event) =>
                        onRule(column.name, {
                          ...rule,
                          required: event.target.checked,
                        })
                      }
                    />
                    Cannot be blank
                  </label>
                  {column.type === "numeric" && (
                    <>
                      <label>
                        Minimum
                        <input
                          type="number"
                          value={rule.min ?? ""}
                          onChange={(event) =>
                            onRule(column.name, {
                              ...rule,
                              min:
                                event.target.value === ""
                                  ? undefined
                                  : Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Maximum
                        <input
                          type="number"
                          value={rule.max ?? ""}
                          onChange={(event) =>
                            onRule(column.name, {
                              ...rule,
                              max:
                                event.target.value === ""
                                  ? undefined
                                  : Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                  <label className="wide">
                    Allowed values
                    <input
                      value={rule.allowed_values?.join(", ") ?? ""}
                      onChange={(event) =>
                        onRule(column.name, {
                          ...rule,
                          allowed_values: event.target.value
                            ? event.target.value
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean)
                            : undefined,
                        })
                      }
                      placeholder="Optional, separated by commas"
                    />
                  </label>
                </div>
              );
            })}
          </div>
          <button className="primary" disabled={busy} onClick={onApplyRules}>
            {busy ? "Checking…" : "Check these rules"}
          </button>
        </details>
        {data.business_rules.configured && (
          <p
            className={
              data.business_rules.passed
                ? "governance-pass"
                : "governance-fail"
            }
          >
            {data.business_rules.passed
              ? "All business rules passed."
              : `${data.business_rules.total_violations} values need review.`}
          </p>
        )}
        <AuditControls
          events={auditEvents}
          canApprove={canApprove}
          onAudit={onAudit}
        />
      </div>
    </details>
  );
}

function AuditControls({
  events,
  canApprove,
  onAudit,
}: {
  events: AuditEvent[];
  canApprove: boolean;
  onAudit: (action: "review" | "approve", note: string) => void;
}) {
  const latest = events.at(-1);
  return (
    <div className="audit-controls">
      <div>
        <strong>Review record</strong>
        <p>
          {events.length} event(s) · latest: {latest?.action ?? "none"}
        </p>
      </div>
      <button
        onClick={() =>
          onAudit("review", "Evidence and configured rules reviewed.")
        }
      >
        Mark as reviewed
      </button>
      <button
        className="primary"
        disabled={!canApprove}
        title={canApprove ? "" : "Passing rules and an approver role are required"}
        onClick={() => onAudit("approve", "Approved for executive use.")}
      >
        Approve report
      </button>
    </div>
  );
}
