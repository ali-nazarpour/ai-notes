import {
  BoardIcon,
  BookIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  FolderIcon,
  LockIcon,
  NotesIcon,
  ShareIcon,
  SlidesIcon,
  SparkleIcon,
} from "../../components/Icons";
import { useI18n } from "../../i18n";

const boardColumns = [
  { status: "planQueue", task: "planReview", color: "queued" },
  { status: "planActive", task: "previewNext", color: "active" },
  { status: "planDone", task: "previewTask", color: "done" },
] as const;

const folders = [
  { name: "workspaceFiles", icon: FolderIcon },
  { name: "workspaceBrief", icon: NotesIcon },
  { name: "workspaceDeliverables", icon: FolderIcon },
] as const;

const questions = ["Ai", "Backup", "Install"] as const;

export function LandingDetails() {
  const { t } = useI18n();

  return (
    <>
      <section id="writing" className="landing-wrap landing-section" aria-labelledby="landing-writing-title">
        <div className="landing-split landing-writing">
          <div className="landing-section-copy">
            <span className="landing-feature-icon">
              <NotesIcon />
            </span>
            <h2 id="landing-writing-title">{t("landing.writingTitle")}</h2>
            <p>{t("landing.writingDescription")}</p>
            <ul className="landing-check-list">
              <li>
                <CheckCircleIcon />
                {t("landing.writingBlocks")}
              </li>
              <li>
                <CheckCircleIcon />
                {t("landing.writingDocs")}
              </li>
            </ul>
          </div>
          <div className="landing-paper">
            <div className="landing-paper-tools" aria-hidden="true">
              <span>H₁</span>
              <b>B</b>
              <i>I</i>
              <span>/</span>
            </div>
            <div className="landing-paper-body">
              <strong>{t("landing.writingSample")}</strong>
              <p>{t("landing.writingSampleBody")}</p>
              <ul className="landing-pills">
                <li>{t("landing.writingTable")}</li>
                <li>{t("landing.writingCode")}</li>
                <li>{t("landing.writingMedia")}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section
        id="planning"
        className="landing-wrap landing-section landing-planning"
        aria-labelledby="landing-planning-title"
      >
        <div className="landing-section-copy">
          <h2 id="landing-planning-title">{t("landing.planningTitle")}</h2>
          <p>{t("landing.planningDescription")}</p>
        </div>
        <div className="landing-board">
          <div className="landing-board-bar">
            <strong>
              <BoardIcon />
              {t("landing.planBoard")}
            </strong>
            <span>
              <CalendarIcon />
              {t("landing.planToday")}
            </span>
          </div>
          <ul className="landing-board-grid">
            {boardColumns.map(({ status, task, color }) => (
              <li key={status} data-status={color}>
                <div className="landing-board-status">{t(`landing.${status}`)}</div>
                <div className="landing-board-task">{t(`landing.${task}`)}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="workspaces" className="landing-workspaces" aria-labelledby="landing-workspace-title">
        <div className="landing-wrap landing-section landing-split">
          <div className="landing-project">
            <div className="landing-project-heading">
              <span className="landing-feature-icon">
                <FolderIcon />
              </span>
              <strong>{t("landing.workspaceSample")}</strong>
              <ShareIcon />
            </div>
            <ul>
              {folders.map(({ name, icon: Icon }) => (
                <li key={name}>
                  <Icon />
                  {t(`landing.${name}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="landing-section-copy">
            <h2 id="landing-workspace-title">{t("landing.workspaceTitle")}</h2>
            <p>{t("landing.workspaceDescription")}</p>
            <ul className="landing-detail-list">
              <li>
                <BoardIcon />
                {t("landing.workspaceProjects")}
              </li>
              <li>
                <FolderIcon />
                {t("landing.workspaceDrive")}
              </li>
              <li>
                <LockIcon />
                {t("landing.workspaceAccess")}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section
        id="learning"
        className="landing-wrap landing-section landing-learning"
        aria-labelledby="landing-learning-title"
      >
        <div className="landing-section-copy">
          <h2 id="landing-learning-title">{t("landing.learningTitle")}</h2>
          <p>{t("landing.learningDescription")}</p>
        </div>
        <div className="landing-learning-grid">
          <article className="landing-learning-card landing-flashcards">
            <div className="landing-learning-art" aria-hidden="true">
              <span>
                <BookIcon />
              </span>
            </div>
            <h3>{t("landing.learningCards")}</h3>
            <p>{t("landing.learningCardsDescription")}</p>
          </article>
          <article className="landing-learning-card landing-slides">
            <div className="landing-learning-art" aria-hidden="true">
              <span>
                <SlidesIcon />
              </span>
            </div>
            <h3>{t("landing.learningSlides")}</h3>
            <p>{t("landing.learningSlidesDescription")}</p>
          </article>
        </div>
      </section>

      <section id="local-ai" className="landing-wrap landing-section" aria-labelledby="landing-local-title">
        <div className="landing-split landing-local-panel">
          <div className="landing-section-copy">
            <span className="landing-feature-icon">
              <LockIcon />
            </span>
            <h2 id="landing-local-title">{t("landing.localTitle")}</h2>
            <p>{t("landing.localDescription")}</p>
            <ul className="landing-check-list">
              <li>
                <CheckCircleIcon />
                {t("landing.ai.description")}
              </li>
              <li>
                <CheckCircleIcon />
                {t("landing.aiSummaries")}
              </li>
            </ul>
          </div>
          <div className="landing-conversation">
            <span className="landing-conversation-label">
              <SparkleIcon />
              {t("landing.ai.title")}
            </span>
            <p className="landing-question">{t("landing.aiPrompt")}</p>
            <div className="landing-answer">
              <p>{t("landing.previewAnswer")}</p>
              <span className="landing-source">
                <NotesIcon />
                {t("landing.aiSource")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        id="faq"
        className="landing-wrap landing-section landing-faq"
        aria-labelledby="landing-faq-title"
      >
        <h2 id="landing-faq-title">{t("landing.faq")}</h2>
        <div className="landing-faq-list">
          {questions.map((topic) => (
            <details key={topic}>
              <summary>
                {t(`landing.faq${topic}Question`)}
                <ChevronDownIcon />
              </summary>
              <p>{t(`landing.faq${topic}Answer`)}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
