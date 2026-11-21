/** Language badges ("EN", "FA") and a "from → to" pair; flag emoji do not render on Windows. */
import { ChevronRightIcon } from "../../components/Icons";
import { useI18n } from "../../i18n";
import { lang } from "./langs";

export function LangTag({ code }: { code: string }) {
  return (
    <span className="lang-tag" data-lang={code}>
      {code.toUpperCase()}
    </span>
  );
}

export function LangPair({ from, to, names = false }: { from: string; to: string; names?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="lang-pair">
      <LangTag code={from} />
      {names && <span>{t(lang(from).label)}</span>}
      <span className="lang-pair-arrow" aria-hidden="true">
        <ChevronRightIcon />
      </span>
      <LangTag code={to} />
      {names && <span>{t(lang(to).label)}</span>}
    </span>
  );
}
