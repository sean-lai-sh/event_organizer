"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Mail,
  Sparkles,
  Users2,
  Workflow,
} from "lucide-react";

const heroStats = [
  { value: "14", label: "speaker leads in play" },
  { value: "06", label: "live replies sorted" },
  { value: "4 officers", label: "working from one board" },
];

const runOfShow = [
  {
    title: "Venue + schedule locked",
    detail: "Student Union Hall · Thursday at 6:30 PM",
    status: "Ready",
  },
  {
    title: "Speaker outreach active",
    detail: "12 sent · 4 confirmed · 3 warm conversations",
    status: "Live",
  },
  {
    title: "Replies triaged automatically",
    detail: "Questions route back to the event without copy-paste",
    status: "Syncing",
  },
];

const proofPills = ["Event boards", "Speaker workflow", "Shared inbox"];

export default function AnimatedHero() {
  return (
    <section className="hero-section">
      <div className="hero-bg" aria-hidden>
        <div className="hero-grid-pattern" />
        <div className="hero-blob hero-blob--1" />
        <div className="hero-blob hero-blob--2" />
        <div className="hero-blob hero-blob--3" />
      </div>

      <div className="hero-shell">
        <div className="hero-grid">
          <div className="hero-copy">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="hero-kicker"
            >
              <Sparkles size={14} />
              <span>Built for ambitious student clubs</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.08, ease: "easeOut" }}
              className="hero-title"
            >
              Events your club
              <br />
              <span className="hero-highlight">actually deserves.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.18, ease: "easeOut" }}
              className="hero-subtitle"
            >
              Bring event planning, speaker outreach, and inbound email into one
              operating system made for officers who need the details to stay in
              sync.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.28, ease: "easeOut" }}
              className="hero-actions"
            >
              <Link href="/signup" className="landing-button landing-button--dark">
                <span>Start organizing</span>
                <ArrowRight size={16} />
              </Link>
              <Link href="/login" className="landing-button landing-button--light">
                See the dashboard
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.36, ease: "easeOut" }}
              className="hero-proof-list"
            >
              {proofPills.map((pill) => (
                <div key={pill} className="hero-proof">
                  <span className="hero-proof-dot" />
                  <span>{pill}</span>
                </div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.42, ease: "easeOut" }}
              className="hero-stat-grid"
            >
              {heroStats.map((stat) => (
                <div key={stat.label} className="hero-stat-card">
                  <div className="hero-stat-value">{stat.value}</div>
                  <div className="hero-stat-label">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
            className="hero-stage-wrap"
          >
            <div className="hero-stage">
              <div className="hero-stage-noise" aria-hidden />

              <div className="hero-stage-header">
                <div>
                  <p className="hero-stage-kicker">Live event cockpit</p>
                  <h2 className="hero-stage-title">Spring Speaker Series</h2>
                </div>
                <div className="hero-stage-status">
                  <CheckCircle2 size={16} />
                  <span>Outreach live</span>
                </div>
              </div>

              <div className="hero-stage-layout">
                <div className="hero-stage-panel">
                  <p className="hero-stage-panel-label">Tonight&apos;s run of show</p>
                  <div className="hero-stage-list">
                    {runOfShow.map((item) => (
                      <div key={item.title} className="hero-stage-item">
                        <div className="hero-stage-item-icon">
                          <CalendarDays size={16} />
                        </div>
                        <div className="hero-stage-item-copy">
                          <p className="hero-stage-item-title">{item.title}</p>
                          <p className="hero-stage-item-detail">{item.detail}</p>
                        </div>
                        <div className="hero-stage-item-status">{item.status}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hero-kpi-grid">
                  <div className="hero-kpi-card">
                    <span className="hero-kpi-value">4</span>
                    <span className="hero-kpi-label">speakers confirmed</span>
                  </div>
                  <div className="hero-kpi-card">
                    <span className="hero-kpi-value">82%</span>
                    <span className="hero-kpi-label">reply rate this week</span>
                  </div>
                  <div className="hero-kpi-card">
                    <span className="hero-kpi-value">2</span>
                    <span className="hero-kpi-label">items need a human touch</span>
                  </div>
                </div>
              </div>

              <div className="hero-stage-footer">
                <div className="hero-stage-pill">Attio identity layer</div>
                <div className="hero-stage-pill">Convex event state</div>
                <div className="hero-stage-pill">Agent reply sync</div>
              </div>
            </div>

            <div className="hero-float-card hero-float-card--reply">
              <div className="hero-float-eyebrow">
                <Mail size={14} />
                <span>Reply captured</span>
              </div>
              <p className="hero-float-title">Can do April 18.</p>
              <p className="hero-float-copy">
                Need projector support and a quick parking note for the speaker.
              </p>
            </div>

            <div className="hero-float-card hero-float-card--owner">
              <div className="hero-float-eyebrow">
                <Users2 size={14} />
                <span>Owner assigned</span>
              </div>
              <p className="hero-float-title">Alicia Kim</p>
              <p className="hero-float-copy">
                External relations now owns follow-up and venue logistics.
              </p>
            </div>

            <div className="hero-float-card hero-float-card--status">
              <div className="hero-float-eyebrow">
                <Workflow size={14} />
                <span>Status synced</span>
              </div>
              <p className="hero-float-title">Question → Engaged</p>
              <p className="hero-float-copy">
                Notes and workflow updated without touching the profile record.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
