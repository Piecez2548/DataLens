import { useState } from "react";
import type { Analysis, AuditEvent, BusinessRule } from "./types";
import { loadTemplates, saveTemplates } from "./ruleTemplates";

export type GovernanceInput = {
  owner: string;
  source_url: string;
  verified_at: string;
  classification: "" | "public" | "internal" | "confidential";
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
              <option value="">Choose a classification</option>
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
          I am allowed to use this non-personal file for the stated purpose.
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
  onLoadRules,
  onAudit,
}: {
  data: Analysis;
  rules: Record<string, BusinessRule>;
  auditEvents: AuditEvent[];
  busy: boolean;
  canApprove: boolean;
  onRule: (column: string, rule: BusinessRule) => void;
  onApplyRules: () => void;
  onLoadRules: (rules: Record<string, BusinessRule>) => void;
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
        </div>
        <details className="rule-editor">
          <summary>Set business rules</summary>
          <p>
            Use these only when your organization has an agreed definition of
            valid values.
          </p>
          <RuleTemplatePicker
            rules={rules}
            columns={data.columns.map((column) => column.name)}
            onLoad={onLoadRules}
          />
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

function RuleTemplatePicker({
  rules,
  columns,
  onLoad,
}: {
  rules: Record<string, BusinessRule>;
  columns: string[];
  onLoad: (rules: Record<string, BusinessRule>) => void;
}) {
  const [templates, setTemplates] = useState(loadTemplates);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState("");
  const [message, setMessage] = useState("");
  const names = Object.keys(templates).sort();
  const hasRules = Object.keys(rules).length > 0;
  function save() {
    const label = name.trim();
    if (!label || !hasRules) return;
    const next = { ...templates, [label]: rules };
    setTemplates(next);
    setMessage(
      saveTemplates(next)
        ? `Saved “${label}” in this browser. Only column names and rule values are stored.`
        : "This browser blocked local storage, so the template was not saved.",
    );
    setChosen(label);
  }
  function load() {
    const template = templates[chosen];
    if (!template) return;
    const matching = Object.fromEntries(
      Object.entries(template).filter(([column]) => columns.includes(column)),
    );
    const skipped = Object.keys(template).length - Object.keys(matching).length;
    onLoad(matching);
    setMessage(
      `Loaded ${Object.keys(matching).length} column rule(s)${skipped ? `; ${skipped} skipped because the column is not in this file` : ""}. Choose “Check these rules” to apply them.`,
    );
  }
  function remove() {
    const { [chosen]: _removed, ...rest } = templates;
    void _removed;
    setTemplates(rest);
    saveTemplates(rest);
    setChosen("");
    setMessage("Template deleted.");
  }
  return (
    <div className="rule-templates">
      <label>
        Saved rule templates
        <select value={chosen} onChange={(event) => setChosen(event.target.value)}>
          <option value="">{names.length ? "Choose a template" : "No templates yet"}</option>
          {names.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!chosen} onClick={load}>Load template</button>
      <button type="button" disabled={!chosen} onClick={remove}>Delete template</button>
      <label>
        Template name
        <input
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder="For example, Monthly sales"
        />
      </label>
      <button type="button" disabled={!name.trim() || !hasRules} onClick={save}>
        Save current rules
      </button>
      {message && <p role="status">{message}</p>}
    </div>
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
        {!canApprove && (
          <p role="status">
            Final approval needs a confirmed header, saved owner and purpose,
            passing business rules, and a completed review.
          </p>
        )}
        <p className="audit-disclaimer">
          Internal workflow approval is included in the exported brief only.
          DataLens does not retain this record, and no one signs in, so it does
          not identify who approved. It is not an audit opinion, legal approval,
          certification, or assurance of source-data accuracy.
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
        title={canApprove ? "" : "A passing rule check and a completed review are required"}
        onClick={() => onAudit("approve", "Internal workflow approval recorded.")}
      >
        Record internal approval
      </button>
    </div>
  );
}
