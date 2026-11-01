import { t } from "./i18n";
import { useState } from "react";
import type { Analysis, BusinessRule } from "./types";
import { loadTemplates, saveTemplates } from "./ruleTemplates";

export function RulesPanel({
  data,
  rules,
  busy,
  onRule,
  onApplyRules,
  onLoadRules,
}: {
  data: Analysis;
  rules: Record<string, BusinessRule>;
  busy: boolean;
  onRule: (column: string, rule: BusinessRule) => void;
  onApplyRules: () => void;
  onLoadRules: (rules: Record<string, BusinessRule>) => void;
}) {
  return (
    <details className="panel governance-panel">
      <summary className="advanced-summary">
        <span>
          <strong>{t("Business rules")}</strong>
          <small>{t("Check that values follow your own rules before sending.")}</small>
        </span>
        <span className="badge">{t("Optional")}</span>
      </summary>
      <div className="advanced-body">
        <div className="rule-editor">
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
        </div>
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
