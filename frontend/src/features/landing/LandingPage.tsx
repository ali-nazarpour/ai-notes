import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import {
  ArrowUpIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GlobeIcon,
  LockIcon,
  MoonIcon,
  NotesIcon,
  SparkleIcon,
  SunIcon,
} from "../../components/Icons";
import { useI18n } from "../../i18n";
import type { Language } from "../../types";
import { LandingDetails } from "./LandingDetails";
import "./landing.css";

const features = [
  { name: "notes", icon: NotesIcon },
  { name: "tasks", icon: CheckCircleIcon },
  { name: "calendar", icon: CalendarIcon },
  { name: "ai", icon: SparkleIcon },
] as const;

const navigation = [
  ["home", "home"],
  ["features", "features"],
  ["writing", "writing"],
  ["planning", "planning"],
  ["workspaces", "workspace"],
  ["learning", "learningShort"],
  ["local-ai", "localAi"],
  ["faq", "faqShort"],
  ["get-started", "getStarted"],
] as const;

interface LandingPageProps {
  signedIn: boolean;
  onLanguageChange: (language: Language) => void;
  onThemeToggle: () => void;
}

export function LandingPage({ signedIn, onLanguageChange, onThemeToggle }: LandingPageProps) {
  const { language, t } = useI18n();
  const languageLabel = language === "fa" ? "فارسی" : "English";
  const startPath = signedIn ? "/" : "/register";
  const startLabel = t(signedIn ? "landing.openWorkspace" : "auth.createAccount");
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!mainRef.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("landing-entered");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -5% 0px" },
    );
    mainRef.current.querySelectorAll(":scope > section").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing" id="landing-top">
      <header
        className="landing-header"
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            setMenuOpen(false);
            menuButtonRef.current?.focus();
          }
        }}
      >
        <div className="landing-wrap landing-header-inner">
          <a href="#landing-top" className="landing-brand" aria-label={t("app.name")}>
            <span className="brand-mark" aria-hidden="true">
              N
            </span>
            <span className="landing-brand-name">{t("app.name")}</span>
          </a>
          <button
            className="landing-button landing-menu-toggle"
            type="button"
            ref={menuButtonRef}
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {t("landing.sections")}
            <ChevronDownIcon />
          </button>
          <nav
            className="landing-nav"
            id="landing-navigation"
            aria-label={t("landing.navigation")}
            data-open={menuOpen}
          >
            {navigation.map(([section, label]) => (
              <a key={section} href={`#${section}`} onClick={() => setMenuOpen(false)}>
                {t(`landing.${label}`)}
              </a>
            ))}
          </nav>
          <div className="landing-controls">
            <button
              className="landing-button landing-language"
              type="button"
              aria-label={t("landing.languageToggle", { current: languageLabel })}
              onClick={() => onLanguageChange(language === "fa" ? "en" : "fa")}
            >
              <GlobeIcon />
              <span lang={language}>{languageLabel}</span>
            </button>
            <button
              className="landing-theme"
              type="button"
              aria-label={t("landing.themeToggle")}
              title={t("landing.themeToggle")}
              onClick={onThemeToggle}
            >
              <span className="landing-moon">
                <MoonIcon />
              </span>
              <span className="landing-sun">
                <SunIcon />
              </span>
            </button>
            <Link className="landing-button landing-header-action" to={signedIn ? "/" : "/login"}>
              {signedIn ? startLabel : t("auth.signIn")}
            </Link>
          </div>
        </div>
      </header>

      <main ref={mainRef}>
        <section id="home" className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-wrap landing-hero-inner">
            <div className="landing-intro">
              <p className="landing-kicker">
                <LockIcon />
                {t("landing.selfHosted")}
              </p>
              <h1 id="landing-title">
                {t("landing.title")} <span>{t("landing.titleAccent")}</span>
              </h1>
              <p className="landing-lead">{t("landing.description")}</p>
              <div className="landing-actions">
                <Link className="landing-button landing-primary" to={startPath}>
                  {startLabel}
                  <ChevronRightIcon />
                </Link>
                <a className="landing-button" href="#features">
                  {t("landing.explore")}
                </a>
              </div>
            </div>

            <figure className="landing-preview" aria-label={t("landing.previewLabel")}>
              <div className="landing-preview-bar">
                <span className="landing-preview-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>{t("landing.previewLabel")}</span>
                <LockIcon />
              </div>
              <div className="landing-preview-body">
                <div className="landing-preview-rail" aria-hidden="true">
                  <span className="brand-mark">N</span>
                  <span className="landing-preview-current">
                    <NotesIcon />
                  </span>
                  <span>
                    <CheckCircleIcon />
                  </span>
                  <span>
                    <CalendarIcon />
                  </span>
                  <span>
                    <SparkleIcon />
                  </span>
                </div>
                <div className="landing-preview-content">
                  <div className="landing-preview-note">
                    <span className="landing-preview-label">
                      <NotesIcon />
                      {t("landing.notes.title")}
                    </span>
                    <strong>{t("landing.previewNote")}</strong>
                    <p>{t("landing.previewNoteBody")}</p>
                    <div className="landing-preview-check">
                      <CheckCircleIcon />
                      {t("landing.previewTask")}
                    </div>
                    <div className="landing-preview-check">
                      <span className="landing-preview-circle" />
                      {t("landing.previewNext")}
                    </div>
                  </div>
                  <div className="landing-preview-ai">
                    <span className="landing-feature-icon">
                      <SparkleIcon />
                    </span>
                    <div>
                      <strong>{t("landing.ai.title")}</strong>
                      <p>{t("landing.previewAnswer")}</p>
                    </div>
                  </div>
                </div>
              </div>
            </figure>
          </div>
        </section>

        <section
          id="features"
          className="landing-wrap landing-features"
          aria-labelledby="landing-features-title"
        >
          <h2 id="landing-features-title">{t("landing.featuresTitle")}</h2>
          <div className="landing-feature-grid">
            {features.map(({ name, icon: Icon }) => (
              <article key={name} className="landing-feature">
                <span className="landing-feature-icon">
                  <Icon />
                </span>
                <h3>{t(`landing.${name}.title`)}</h3>
                <p>{t(`landing.${name}.description`)}</p>
              </article>
            ))}
          </div>
        </section>

        <LandingDetails />

        <section
          id="get-started"
          className="landing-wrap landing-section landing-start"
          aria-labelledby="landing-start-title"
        >
          <div className="landing-start-panel">
            <h2 id="landing-start-title">{t("landing.startTitle")}</h2>
            <p>{t("landing.startDescription")}</p>
            <Link className="landing-button landing-primary" to={startPath}>
              {startLabel}
              <ChevronRightIcon />
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap">
          <div className="landing-footer-main">
            <div className="landing-footer-about">
              <a href="#landing-top" className="landing-brand">
                <span className="brand-mark" aria-hidden="true">
                  N
                </span>
                {t("app.name")}
              </a>
              <p>{t("landing.footerDescription")}</p>
            </div>
            <nav className="landing-footer-nav" aria-label={t("landing.footerNavigation")}>
              <div>
                <h2>{t("landing.footerProduct")}</h2>
                <a href="#writing">{t("landing.writing")}</a>
                <a href="#planning">{t("landing.planning")}</a>
                <a href="#workspaces">{t("landing.workspace")}</a>
                <a href="#learning">{t("landing.learning")}</a>
              </div>
              <div>
                <h2>{t("landing.footerResources")}</h2>
                <a href="#features">{t("landing.features")}</a>
                <a href="#local-ai">{t("landing.localAi")}</a>
                <a href="#faq">{t("landing.faq")}</a>
              </div>
              <div>
                <h2>{t("landing.footerAccount")}</h2>
                {!signedIn && <Link to="/login">{t("auth.signIn")}</Link>}
                <Link to={startPath}>{startLabel}</Link>
              </div>
            </nav>
          </div>
          <div className="landing-footer-bottom">
            <span>
              <LockIcon />
              {t("landing.selfHosted")}
            </span>
            <a href="#landing-top">
              {t("landing.footerTop")}
              <ArrowUpIcon />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
