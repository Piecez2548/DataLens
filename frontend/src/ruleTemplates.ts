import type { BusinessRule } from "./types";

// Rule templates hold only column names and thresholds, never data, and live in this browser.
const KEY = "datalens.ruleTemplates";
export type RuleTemplates = Record<string, Record<string, BusinessRule>>;

export function loadTemplates(): RuleTemplates {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as RuleTemplates)
      : {};
  } catch {
    return {};
  }
}

export function saveTemplates(templates: RuleTemplates): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(templates));
    return true;
  } catch {
    return false;
  }
}
