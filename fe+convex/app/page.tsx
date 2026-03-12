import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Mail,
  ShieldCheck,
  Sparkles,
  Users2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import AnimatedHero from "@/components/AnimatedHero";

type CapabilityCard = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type PlatformLayer = {
  eyebrow: string;
  title: string;
  caption: string;
  chips: string[];
  tone: "ink" | "mist" | "clay" | "linen";
  top: string;
  rotate: number;
  zIndex: number;
};

const capabilityCards: CapabilityCard[] = [
  {
    title: "Event command center",
    description:
      "Spin up an event board, lock milestones, and keep every officer on the same timeline from planning to showtime.",
    icon: CalendarDays,
  },
  {
    title: "Speaker workflow",
    description:
      "Track prospecting, outreach, confirmations, and prior appearances without leaking workflow state into contact identity.",
    icon: Users2,
  },
  {
    title: "Reply intake",
    description:
      "Known threads and new inbound messages route back to the right event so context stays attached to the work.",
    icon: Mail,
  },
  {
    title: "Assignment visibility",
    description:
      "Internal ownership stays explicit, mirrored across the board, and easy to hand off when officers change roles.",
    icon: Workflow,
  },
  {
    title: "Automation that helps",
    description:
      "Use AI for matching, summaries, and triage while keeping the human decisions visible and auditable.",
    icon: Sparkles,
  },
  {
    title: "Clean audit trail",
    description:
      "Important notes, decisions, and status changes stay attached to the right person, speaker record, and event history.",
    icon: ShieldCheck,
  },
];

const platformNotesLeft = [
  {
    title: "Attio is the identity layer",
    description:
      "People holds canonical contact identity while speakers owns workflow, assignment, and event history.",
  },
  {
    title: "Convex keeps live event state",
    description:
      "Per-event outreach, thread links, ownership history, and dedupe receipts stay operational and retry-safe.",
  },
];

const platformNotesRight = [
  {
    title: "Agents handle the repetitive glue",
    description:
      "Matching, outbound sends, and reply handling coordinate the CRM and app database without inventing new truth.",
  },
  {
    title: "Officers get one operating surface",
    description:
      "Dashboards, event boards, and inbox context are organized for execution instead of scattered across tabs.",
  },
];

const platformLayers: PlatformLayer[] = [
  {
    eyebrow: "System of record",
    title: "Attio",
    caption: "Identity + speaker workflow",
    chips: ["People", "Speakers", "Notes"],
    tone: "ink",
    top: "208px",
    rotate: -6,
    zIndex: 1,
  },
  {
    eyebrow: "Operational state",
    title: "Convex",
    caption: "Per-event coordination",
    chips: ["Events", "Outreach", "Receipts"],
    tone: "mist",
    top: "142px",
    rotate: -2,
    zIndex: 2,
  },
  {
    eyebrow: "Agent runtime",
    title: "Automation layer",
    caption: "Matching, sync, triage",
    chips: ["Replies", "Assignments", "Notes"],
    tone: "clay",
    top: "76px",
    rotate: 2,
    zIndex: 3,
  },
  {
    eyebrow: "Organizer view",
    title: "Club workspace",
    caption: "What officers actually use",
    chips: ["Dashboard", "Inbox", "Timeline"],
    tone: "linen",
    top: "12px",
    rotate: 6,
    zIndex: 4,
  },
];

const proofCards = [
  {
    value: "One shared board",
    label: "instead of six disconnected tabs",
    detail:
      "Events, outreach, replies, and owners stay visible in the same operating surface.",
  },
  {
    value: "Workflow stays scoped",
    label: "without polluting contact identity",
    detail:
      "Speaker status, source, and active event stay on the workflow layer where they belong.",
  },
  {
    value: "Replies stay traceable",
    label: "to the thread and the event",
    detail:
      "Known conversations and net-new inbound both land in a structure your team can act on.",
  },
  {
    value: "Ownership stays explicit",
    label: "across officers and events",
    detail:
      "Assignments are visible, handoffs are clear, and follow-up never relies on memory.",
  },
];

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-nav-shell">
        <nav className="landing-nav">
          <Link href="/" className="landing-brand">
            eventclub
          </Link>

          <div className="landing-nav-links">
            <Link href="#capabilities">Capabilities</Link>
            <Link href="#architecture">Architecture</Link>
            <Link href="#proof">Why teams switch</Link>
          </div>

          <div className="landing-nav-actions">
            <Link href="/login" className="landing-link">
              Sign in
            </Link>
            <Link href="/signup" className="landing-button landing-button--dark">
              <span>Get started</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </nav>
      </header>

      <AnimatedHero />

      <section id="capabilities" className="landing-section">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Capabilities</p>
          <h2>Everything officers need to pull off a speaker-led event.</h2>
          <p className="landing-section-copy">
            From the first shortlist to the last inbound question, the workflow
            stays visible, shared, and current.
          </p>
        </div>

        <div className="capability-grid">
          {capabilityCards.map(({ title, description, icon: Icon }) => (
            <article key={title} className="capability-card">
              <div className="capability-icon">
                <Icon size={20} />
              </div>
              <h3 className="capability-title">{title}</h3>
              <p className="capability-desc">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="architecture" className="platform-section">
        <div className="platform-inner">
          <div className="platform-header">
            <p className="platform-eyebrow">Architecture</p>
            <h2 className="platform-heading">
              A stack built to keep clubs operational, not just organized.
            </h2>
            <p className="platform-subheading">
              The app surfaces one clean experience for officers while the
              underlying systems keep identity, workflow, and event state in the
              right places.
            </p>
          </div>

          <div className="platform-diagram">
            <div className="platform-col">
              {platformNotesLeft.map((note) => (
                <article key={note.title} className="platform-note">
                  <h3 className="platform-note-title">{note.title}</h3>
                  <p className="platform-note-desc">{note.description}</p>
                </article>
              ))}
            </div>

            <div className="platform-stack" aria-hidden>
              <div className="platform-stack-glow" />
              {platformLayers.map((layer) => (
                <div
                  key={layer.title}
                  className={`platform-layer platform-layer--${layer.tone}`}
                  style={{
                    top: layer.top,
                    transform: `translateX(-50%) rotate(${layer.rotate}deg)`,
                    zIndex: layer.zIndex,
                  }}
                >
                  <p className="platform-layer__eyebrow">{layer.eyebrow}</p>
                  <h3 className="platform-layer__title">{layer.title}</h3>
                  <p className="platform-layer__caption">{layer.caption}</p>
                  <div className="platform-chip-row">
                    {layer.chips.map((chip) => (
                      <span key={chip} className="platform-chip">
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="platform-col">
              {platformNotesRight.map((note) => (
                <article key={note.title} className="platform-note">
                  <h3 className="platform-note-title">{note.title}</h3>
                  <p className="platform-note-desc">{note.description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="proof" className="proof-section">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Why teams switch</p>
          <h2>A cleaner way to run outreach-heavy events.</h2>
          <p className="landing-section-copy">
            The point is not another pretty dashboard. It is fewer dropped
            threads, clearer ownership, and less status drift across the tools
            your team already relies on.
          </p>
        </div>

        <div className="proof-grid">
          {proofCards.map((card) => (
            <article key={card.value} className="proof-card">
              <div className="proof-value">{card.value}</div>
              <div className="proof-label">{card.label}</div>
              <p className="proof-detail">{card.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-card">
          <div className="cta-copy">
            <p className="landing-eyebrow">Start the next cycle clean</p>
            <h2 className="cta-heading">
              Stop stitching together docs, inboxes, and spreadsheets.
            </h2>
            <p className="cta-subheading">
              Create one board for your next event, invite your officers, and
              let the system keep outreach and replies aligned.
            </p>
          </div>

          <div className="cta-actions">
            <Link href="/signup" className="landing-button landing-button--dark">
              <span>Create free account</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/login" className="landing-link">
              Already have an account
            </Link>
            <p className="cta-note">
              Designed for club teams that run speakers, workshops, and member
              events on repeat.
            </p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div>
          <div className="landing-brand">eventclub</div>
          <p className="landing-footer-copy">
            Event operations for clubs that need more than a calendar page.
          </p>
        </div>

        <div className="landing-footer-links">
          <Link href="/login" className="landing-footer-link">
            Sign in
          </Link>
          <Link href="/signup" className="landing-footer-link">
            Create account
          </Link>
          <Link href="#architecture" className="landing-footer-link">
            Architecture
          </Link>
        </div>
      </footer>
    </main>
  );
}
