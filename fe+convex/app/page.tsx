import Link from "next/link";

const features = [
  {
    label: "Event Creation",
    desc: "Spin up events in seconds. Set dates, venues, capacity, and RSVP deadlines without leaving the dashboard.",
  },
  {
    label: "Speaker Outreach",
    desc: "Track speaker confirmations, bios, and talk details. Know exactly who is confirmed and who is pending.",
  },
  {
    label: "Email Threads",
    desc: "All event communication in one place. Monitor inbound and outbound messages without switching tabs.",
  },
  {
    label: "Attendee Lists",
    desc: "View, filter, and export your guest list. Send targeted updates to any segment of your audience.",
  },
  {
    label: "Club Dashboard",
    desc: "One home for every event your club runs: past events, upcoming ones, and everything in between.",
  },
  {
    label: "Instant Invites",
    desc: "Share a clean event page in one click. Members RSVP without needing an account of their own.",
  },
];

const platformLeft = [
  {
    title: "Alumni CRM Integration",
    desc: "Attendee history syncs with your alumni network. Every person, every event, one record.",
  },
  {
    title: "Real-time Event Sync",
    desc: "Every RSVP and update propagates instantly across your entire organizing team.",
  },
];

const platformRight = [
  {
    title: "AI Email Webhooks",
    desc: "Incoming replies are parsed and routed automatically. Progress updates itself.",
  },
  {
    title: "Unified Dashboard",
    desc: "Orchestrates everything into a single view. One place to see where every event stands.",
  },
];

const stats = [
  { num: "2,400+", label: "Events organized" },
  { num: "18K+", label: "Attendees managed" },
  { num: "340+", label: "Active clubs" },
  { num: "98%", label: "Show-up rate" },
];

export default function Home() {
  return (
    <main
      style={{
        fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
        background: "#fafafa",
        color: "#0a0a0a",
        minHeight: "100vh",
      }}
    >
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 60px",
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#fafafafd",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #ebebeb",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: "-0.04em",
            color: "#0a0a0a",
          }}
        >
          eventclub
        </span>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          <Link
            href="/login"
            style={{ color: "#666", fontSize: 14, textDecoration: "none" }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: "-0.01em",
            }}
          >
            Get started
          </Link>
        </div>
      </nav>

      <section style={{ padding: "100px 60px 88px", maxWidth: 1440, margin: "0 auto" }}>
        <div
          style={{
            display: "inline-block",
            background: "#f0f0f0",
            color: "#666",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            padding: "6px 14px",
            borderRadius: 100,
            marginBottom: 32,
            textTransform: "uppercase",
          }}
        >
          Built for student clubs
        </div>
        <h1
          style={{
            fontSize: "clamp(52px, 8vw, 88px)",
            fontWeight: 300,
            letterSpacing: "-0.05em",
            lineHeight: 0.95,
            maxWidth: 860,
            margin: 0,
            color: "#0a0a0a",
          }}
        >
          Events your club
          <br />
          <em style={{ fontStyle: "italic", color: "#aaa" }}>actually</em>{" "}
          deserves.
        </h1>
        <p
          style={{
            color: "#999",
            fontSize: 18,
            maxWidth: 480,
            lineHeight: 1.65,
            marginTop: 28,
            marginBottom: 44,
            fontWeight: 300,
          }}
        >
          Plan, organize, and execute your club events. Manage speakers, track
          RSVPs, and keep every thread in one place.
        </p>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link
            href="/signup"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              padding: "14px 28px",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: "-0.01em",
            }}
          >
            Start organizing →
          </Link>
          <Link
            href="/login"
            style={{
              color: "#999",
              fontSize: 15,
              textDecoration: "none",
              letterSpacing: "-0.01em",
            }}
          >
            Already have an account
          </Link>
        </div>
      </section>

      <div style={{ borderTop: "1px solid #ebebeb" }} />

      <section style={{ padding: "88px 60px", maxWidth: 1440, margin: "0 auto" }}>
        <p
          style={{
            color: "#bbb",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 56,
          }}
        >
          Everything you need
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 1,
            background: "#ebebeb",
            border: "1px solid #ebebeb",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {features.map((feature) => (
            <div
              key={feature.label}
              style={{ background: "#fafafa", padding: "44px 36px" }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#0a0a0a",
                  marginBottom: 24,
                }}
              />
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  marginTop: 0,
                  marginBottom: 10,
                  color: "#0a0a0a",
                }}
              >
                {feature.label}
              </h3>
              <p
                style={{
                  color: "#999",
                  fontSize: 14,
                  lineHeight: 1.7,
                  fontWeight: 300,
                  margin: 0,
                }}
              >
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: "1px solid #ebebeb" }} />

      <section
        style={{
          background: "#f8f8f8",
          borderBottom: "1px solid #ebebeb",
          padding: "100px 60px",
        }}
      >
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 72 }}>
            <p
              style={{
                color: "#6b6b6b",
                fontSize: 17,
                fontWeight: 400,
                letterSpacing: "-0.5px",
                marginTop: 0,
                marginBottom: 16,
              }}
            >
              Architecture
            </p>
            <h2
              style={{
                fontFamily: "var(--font-outfit), Outfit, system-ui, sans-serif",
                fontSize: "clamp(36px, 4vw, 48px)",
                fontWeight: 300,
                color: "#393939",
                letterSpacing: "-2.4px",
                lineHeight: 1.05,
                maxWidth: 620,
                margin: "0 auto 18px",
              }}
            >
              A platform built to connect everything your club needs.
            </h2>
            <p
              style={{
                fontSize: 20,
                fontWeight: 400,
                color: "#6b6b6b",
                letterSpacing: "-0.35px",
                lineHeight: 1.6,
                maxWidth: 500,
                margin: "0 auto",
              }}
            >
              A shared foundation that keeps your events, outreach, and alumni
              data in sync automatically.
            </p>
          </div>

          <div className="pen-platform-row">
            <div className="pen-platform-col pen-platform-col--left">
              {platformLeft.map((item) => (
                <article key={item.title} className="pen-platform-label">
                  <h3 className="pen-platform-label-title">{item.title}</h3>
                  <p className="pen-platform-label-desc">{item.desc}</p>
                </article>
              ))}
            </div>

            <div className="pen-platform-image" aria-hidden />

            <div className="pen-platform-col pen-platform-col--right">
              {platformRight.map((item) => (
                <article key={item.title} className="pen-platform-label">
                  <h3 className="pen-platform-label-title">{item.title}</h3>
                  <p className="pen-platform-label-desc">{item.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "#f4f4f4", padding: "72px 60px" }}>
        <div
          style={{
            maxWidth: 1320,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 40,
          }}
        >
          {stats.map((stat) => (
            <div key={stat.label}>
              <div
                style={{
                  fontSize: "clamp(32px, 4vw, 52px)",
                  fontWeight: 300,
                  letterSpacing: "-0.05em",
                  marginBottom: 6,
                  color: "#0a0a0a",
                }}
              >
                {stat.num}
              </div>
              <div style={{ color: "#aaa", fontSize: 14 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          padding: "110px 60px",
          maxWidth: 1440,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 40,
        }}
      >
        <h2
          style={{
            fontSize: "clamp(40px, 6vw, 68px)",
            fontWeight: 300,
            letterSpacing: "-0.05em",
            lineHeight: 0.97,
            maxWidth: 620,
            margin: 0,
            color: "#0a0a0a",
          }}
        >
          Ready to run
          <br />
          your next
          <br />
          club event?
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "flex-end",
          }}
        >
          <Link
            href="/signup"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              padding: "16px 32px",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            Create free account →
          </Link>
          <span style={{ color: "#bbb", fontSize: 13 }}>
            No credit card required
          </span>
        </div>
      </section>

      <div style={{ borderTop: "1px solid #ebebeb" }} />

      <footer
        style={{
          height: 80,
          padding: "0 60px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#fafafa",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.04em" }}>
          eventclub
        </span>
        <span style={{ color: "#bbb", fontSize: 13 }}>
          © 2026 eventclub. Built for clubs everywhere.
        </span>
      </footer>
    </main>
  );
}
