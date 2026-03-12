"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: "#fafafa", color: "#0a0a0a", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 60px", position: "sticky", top: 0, zIndex: 50, background: "#fafafafd", backdropFilter: "blur(12px)", borderBottom: "1px solid #ebebeb" }}>
        <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.04em", color: "#0a0a0a" }}>eventclub</span>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <Link href="/login" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>Sign in</Link>
          <Link href="/signup" style={{ background: "#0a0a0a", color: "#fff", padding: "10px 20px", borderRadius: 6, fontSize: 14, fontWeight: 600, textDecoration: "none", letterSpacing: "-0.01em" }}>Get started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "110px 60px 90px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "inline-block", background: "#f0f0f0", color: "#666", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", padding: "6px 14px", borderRadius: 100, marginBottom: 36, textTransform: "uppercase" }}>
          Built for student clubs
        </div>
        <h1 style={{ fontSize: "clamp(52px, 8vw, 92px)", fontWeight: 300, letterSpacing: "-0.05em", lineHeight: 0.95, maxWidth: 860, marginBottom: 28, color: "#0a0a0a" }}>
          Events your club<br />
          <em style={{ fontStyle: "italic", color: "#aaa" }}>actually</em> deserves.
        </h1>
        <p style={{ color: "#888", fontSize: 19, maxWidth: 500, lineHeight: 1.65, marginBottom: 48, fontWeight: 300 }}>
          Plan, organize, and execute your club events. Manage speakers, track RSVPs, and keep every thread in one place.
        </p>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Link href="/signup" style={{ background: "#0a0a0a", color: "#fff", padding: "14px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", letterSpacing: "-0.01em" }}>
            Start organizing →
          </Link>
          <Link href="/login" style={{ color: "#999", fontSize: 15, textDecoration: "none", letterSpacing: "-0.01em" }}>
            Already have an account
          </Link>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: "1px solid #ebebeb" }} />

      {/* Features */}
      <section style={{ padding: "100px 60px", maxWidth: 1200, margin: "0 auto" }}>
        <p style={{ color: "#aaa", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 64 }}>Everything you need</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "#ebebeb", border: "1px solid #ebebeb", borderRadius: 12, overflow: "hidden" }}>
          {[
            { label: "Event Creation", desc: "Spin up events in seconds. Set dates, venues, capacity, and RSVP deadlines without leaving the dashboard." },
            { label: "Speaker Outreach", desc: "Track speaker confirmations, bios, and talk details. Know exactly who's confirmed and who's pending." },
            { label: "Email Threads", desc: "All event communication in one place. Monitor inbound and outbound messages without switching tabs." },
            { label: "Attendee Lists", desc: "View, filter, and export your guest list. Send targeted updates to any segment of your audience." },
            { label: "Club Dashboard", desc: "One home for every event your club runs — past events, upcoming ones, and everything in between." },
            { label: "Instant Invites", desc: "Share a clean event page in one click. Members RSVP without needing an account of their own." },
          ].map((f, i) => (
            <div key={i} style={{ background: "#fafafa", padding: "44px 36px" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0a0a0a", marginBottom: 24 }} />
              <h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 10, color: "#0a0a0a" }}>{f.label}</h3>
              <p style={{ color: "#999", fontSize: 14, lineHeight: 1.7, fontWeight: 300 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Platform / Isometric Section */}
      <section className="platform-section">
        <div className="platform-inner">

          {/* Centered header */}
          <div className="platform-header">
            <p className="platform-eyebrow">Architecture</p>
            <h2 className="platform-heading">
              A platform built to connect everything your club needs.
            </h2>
            <p className="platform-subheading">
              A shared foundation that keeps your events, outreach, and alumni data in sync — automatically.
            </p>
          </div>

          {/* Diagram + zigzag labels */}
          <div className="platform-diagram">
            {/* Left column — layers 1 & 3 */}
            <div className="platform-col platform-col--left">
              <div>
                <div className="platform-label-title">Alumni CRM Integration</div>
                <div className="platform-label-desc">Attendee history syncs with your alumni network. Every person, every event, one record.</div>
              </div>
              <div>
                <div className="platform-label-title">Real-time Event Sync</div>
                <div className="platform-label-desc">Every RSVP and update propagates instantly across your entire organizing team.</div>
              </div>
            </div>

            {/* Central isometric image */}
            <div className="platform-diagram-image">
              {/* Placeholder — will be replaced with generated image */}
            </div>

            {/* Right column — layers 2 & 4 */}
            <div className="platform-col platform-col--right">
              <div>
                <div className="platform-label-title">AI Email Webhooks</div>
                <div className="platform-label-desc">Incoming replies are parsed and routed automatically. Progress updates itself.</div>
              </div>
              <div>
                <div className="platform-label-title">Unified Dashboard</div>
                <div className="platform-label-desc">Orchestrates everything into a single view. One place to see where every event stands.</div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Stats */}
      <section style={{ background: "#f4f4f4", padding: "80px 60px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40 }}>
          {[
            { num: "2,400+", label: "Events organized" },
            { num: "18K+", label: "Attendees managed" },
            { num: "340+", label: "Active clubs" },
            { num: "98%", label: "Show-up rate" },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 300, letterSpacing: "-0.05em", marginBottom: 6, color: "#0a0a0a" }}>{s.num}</div>
              <div style={{ color: "#aaa", fontSize: 14 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "120px 60px", maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40 }}>
        <h2 style={{ fontSize: "clamp(40px, 6vw, 72px)", fontWeight: 300, letterSpacing: "-0.05em", lineHeight: 1, maxWidth: 680, color: "#0a0a0a" }}>
          Ready to run your<br />next club event?
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
          <Link href="/signup" style={{ background: "#0a0a0a", color: "#fff", padding: "16px 32px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
            Create free account →
          </Link>
          <span style={{ color: "#bbb", fontSize: 13 }}>No credit card required</span>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #ebebeb", padding: "36px 60px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.04em" }}>eventclub</span>
        <span style={{ color: "#bbb", fontSize: 13 }}>© 2026 eventclub. Built for clubs everywhere.</span>
      </footer>

    </main>
  );
}
