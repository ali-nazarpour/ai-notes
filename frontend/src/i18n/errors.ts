import { ApiError } from "../api/client";
import type { I18n, Params } from "./index";

/** A translated, user-facing message for any error. */
export function errorMessage(error: unknown, i18n: Pick<I18n, "t" | "has">): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return i18n.t("errors.network");
    const key = `errors.${error.code}`;
    if (error.code && i18n.has(key)) {
      const params: Params = {};
      for (const [name, value] of Object.entries(error.params)) {
        if (typeof value === "string" || typeof value === "number") params[name] = value;
      }
      return i18n.t(key, params);
    }
    if (error.code === "validation_error") return `${i18n.t("errors.validation")} ${error.message}`;
    return error.message;
  }
  return error instanceof Error && error.message ? error.message : i18n.t("errors.unknown");
}
