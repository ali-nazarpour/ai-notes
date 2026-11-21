/** Random password / passphrase generator with live strength. */
import { useCallback, useEffect, useState } from "react";

import { DiceIcon } from "../../components/Icons";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useI18n } from "../../i18n";
import {
  DEFAULT_GENERATOR,
  generatePassphrase,
  generatePassword,
  passwordStrength,
  type GeneratorOptions,
} from "../../lib/passwords";

export function StrengthMeter({ password }: { password: string }) {
  const { t } = useI18n();
  const { level } = passwordStrength(password);
  if (!password) return null;
  return (
    <span className="strength" data-level={level}>
      <span className="strength-bar">
        <span style={{ width: `${(level + 1) * 20}%` }} />
      </span>
      {t(`strength.${level}`)}
    </span>
  );
}

export function PasswordGenerator({ onUse }: { onUse: (password: string) => void }) {
  const { t, calendar } = useI18n();
  const [mode, setMode] = useLocalStorage<"password" | "passphrase">("notes.generatorMode", "password");
  const [options, setOptions] = useLocalStorage<GeneratorOptions>("notes.generator", DEFAULT_GENERATOR);
  const [words, setWords] = useLocalStorage("notes.generatorWords", 5);
  const [value, setValue] = useState("");

  const regenerate = useCallback(() => {
    setValue(mode === "password" ? generatePassword(options) : generatePassphrase(words));
  }, [mode, options, words]);

  useEffect(regenerate, [regenerate]);

  const toggle = (key: "lower" | "upper" | "digits" | "symbols" | "avoidAmbiguous") =>
    setOptions({ ...options, [key]: !options[key] });

  return (
    <div className="generator">
      <div className="generator-output">
        <code dir="ltr">{value}</code>
        <button
          type="button"
          className="icon-button"
          onClick={regenerate}
          aria-label={t("vault.regenerate")}
          title={t("vault.regenerate")}
        >
          <DiceIcon />
        </button>
      </div>
      <StrengthMeter password={value} />
      <div className="segmented" role="group" aria-label={t("vault.generatorMode")}>
        <button type="button" aria-pressed={mode === "password"} onClick={() => setMode("password")}>
          {t("vault.mode.password")}
        </button>
        <button type="button" aria-pressed={mode === "passphrase"} onClick={() => setMode("passphrase")}>
          {t("vault.mode.passphrase")}
        </button>
      </div>
      {mode === "password" ? (
        <>
          <label className="range-row">
            <span>{t("vault.length")}</span>
            <input
              type="range"
              min={8}
              max={64}
              value={options.length}
              onChange={(event) => setOptions({ ...options, length: Number(event.target.value) })}
            />
            <strong>{calendar.formatNumber(options.length)}</strong>
          </label>
          <div className="check-grid">
            {(["upper", "lower", "digits", "symbols", "avoidAmbiguous"] as const).map((key) => (
              <label key={key} className="check-row">
                <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
                <span>{t(`vault.option.${key}`)}</span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <label className="range-row">
          <span>{t("vault.words")}</span>
          <input
            type="range"
            min={3}
            max={10}
            value={words}
            onChange={(event) => setWords(Number(event.target.value))}
          />
          <strong>{calendar.formatNumber(words)}</strong>
        </label>
      )}
      <button type="button" className="primary block" onClick={() => onUse(value)}>
        {t("vault.usePassword")}
      </button>
    </div>
  );
}
