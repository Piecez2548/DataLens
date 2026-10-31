import { t, tf } from "./i18n";
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
          <strong>{t("Prepare an executive report")}</strong>
          <small>{t("Add the owner and source when this analysis will be shared.")}</small>
        </span>
        <span className="badge">{t(saved ? "Details added" : "Optional")}</span>
      </summary>
      <div className="advanced-body">
        <div className="governance-fields">
          <label>{t("Data owner")}<span className="required-mark">{t("Required to save")}</span>
            <input
              value={value.owner}
              maxLength={120}
              onChange={(event) =>
                onChange({ ...value, owner: event.target.value })
              }
              placeholder="For example, Sales Operations"
            />
          </label>
          <label>{t("Data classification")}<select
              value={value.classification}
              onChange={(event) =>
                onChange({
                  ...value,
                  classification: event.target
                    .value as GovernanceInput["classification"],
                })
              }
            >
              <option value="">{t("Choose a classification")}</option>
              <option value="public">{t("Public")}</option>
              <option value="internal">{t("Internal")}</option>
              <option value="confidential">{t("Confidential")}</option>
            </select>
          </label>
          <label>{t("Official source")}<span className="optional-mark">{t("Optional")}</span>
            <input
              type="url"
              value={value.source_url}
              onChange={(event) =>
                onChange({ ...value, source_url: event.target.value })
              }
              placeholder="https://source.example"
            />
          </label>
          <label>{t("Source checked on")}<span className="optional-mark">{t("Optional")}</span>
            <input
              type="date"
              value={value.verified_at}
              onChange={(event) =>
                onChange({ ...value, verified_at: event.target.value })
              }
            />
          </label>
          <label className="wide">{t("Report purpose")}<span className="required-mark">{t("Required to save")}</span>
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
          />{t("I am allowed to use this non-personal file for the stated purpose.")}</label>
        <div className="advanced-actions">
          <p>{t("These details are included in the report. DataLens does not retain the CSV on its server.")}</p>
          <button className="primary" disabled={busy || !ready} onClick={onSave}>
            {t(busy ? "Saving…" : saved ? "Update report details" : "Add report details")}
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
          <strong>{t("Advanced checks and approval")}</strong>
          <small>{t("Set business rules or record a formal review.")}</small>
        </span>
        <span className="badge">{t("Optional")}</span>
      </summary>
      <div className="advanced-body">
        <div className="governance-summary">
          <div>
            <span>{t("Analysis ID")}</span>
            <strong>{data.governance.analysis_id.slice(0, 12)}…</strong>
          </div>
          <div>
            <span>{t("File retention")}</span>
            <strong>{t("Not stored")}</strong>
          </div>
        </div>
        <details className="rule-editor">
          <summary>{t("Set business rules")}</summary>
          <p>{t("Use these only when your organization has an agreed definition of valid values.")}</p>
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
                    />{t("Cannot be blank")}</label>
                  {column.type === "numeric" && (
                    <>
                      <label>{t("Minimum")}<input
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
                      <label>{t("Maximum")}<input
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
                  <label className="wide">{t("Allowed values")}<input
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
            {t(busy ? "Checking…" : "Check these rules")}
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
      <label>{t("Saved rule templates")}<select value={chosen} onChange={(event) => setChosen(event.target.value)}>
          <option value="">{t(names.length ? "Choose a template" : "No templates yet")}</option>
          {names.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!chosen} onClick={load}>{t("Load template")}</button>
      <button type="button" disabled={!chosen} onClick={remove}>{t("Delete template")}</button>
      <label>{t("Template name")}<input
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder="For example, Monthly sales"
        />
      </label>
      <button type="button" disabled={!name.trim() || !hasRules} onClick={save}>{t("Save current rules")}</button>
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
        <strong>{t("Review record")}</strong>
        <p>
          {tf("{count} event(s) · latest: {latest}", { count: events.length, latest: latest?.action ?? t("none") })}
        </p>
        {!canApprove && (
          <p role="status">{t("Final approval needs a confirmed header, saved owner and purpose, passing business rules, and a completed review.")}</p>
        )}
        <p className="audit-disclaimer">{t("Internal workflow approval is included in the exported brief only. DataLens does not retain this record, and no one signs in, so it does not identify who approved. It is not an audit opinion, legal approval, certification, or assurance of source-data accuracy.")}</p>
      </div>
      <button
        onClick={() =>
          onAudit("review", "Evidence and configured rules reviewed.")
        }
      >{t("Mark as reviewed")}</button>
      <button
        className="primary"
        disabled={!canApprove}
        title={canApprove ? "" : "A passing rule check and a completed review are required"}
        onClick={() => onAudit("approve", "Internal workflow approval recorded.")}
      >{t("Record internal approval")}</button>
    </div>
  );
}
