"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

const boardRows = [
  { label: "4 speakers confirmed", state: "Live", dot: "dark" },
  { label: "12 replies triaged", state: "Today", dot: "mid" },
  { label: "2 items need owner", state: "Action", dot: "light" },
] as const;

const nextWindowRows = [
  { label: "Send follow-up batch", time: "Today · 4:00 PM" },
  { label: "Finalize room setup", time: "Tomorrow · 11:00 AM" },
  { label: "Review open questions", time: "Friday · 9:30 AM" },
] as const;

export default function LandingHero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="landing-hero-vc">
      <div className="landing-hero-vc__inner">
        <motion.div
          className="landing-hero-vc__left"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
         
          <h1 className="landing-hero-vc__title">
            Run standout events
            <br />
            without the chaos.
          </h1>
          <p className="landing-hero-vc__subtitle">
            Plan events, manage speaker outreach, and keep every reply in one
            shared workspace for your team.
          </p>
          <Link href="/signup" className="landing-hero-vc__cta landing-solid-cta no-underline">
            Start organizing →
          </Link>
        </motion.div>

        <motion.div
          className="landing-hero-vc__right"
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.52, delay: 0.08, ease: "easeOut" }}
        >
          <div className="landing-hero-vc__card">
            <h2 className="landing-hero-vc__card-title">Spring Speaker Series</h2>
            <p className="landing-hero-vc__card-subtitle">
              Live board keeps outreach, replies, and assignments aligned.
            </p>
            <div className="landing-hero-vc__list">
              {boardRows.map((row) => (
                <div key={row.label} className="landing-hero-vc__list-row">
                  <div className="landing-hero-vc__list-left">
                    <span
                      className={`landing-hero-vc__dot landing-hero-vc__dot--${row.dot}`}
                    />
                    <span>{row.label}</span>
                  </div>
                  <span className="landing-hero-vc__list-state">{row.state}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="landing-hero-vc__kpi-row">
            <div className="landing-hero-vc__kpi-card">
              <div className="landing-hero-vc__kpi-value">82%</div>
              <div className="landing-hero-vc__kpi-label">weekly reply rate</div>
            </div>
            <div className="landing-hero-vc__kpi-card">
              <div className="landing-hero-vc__kpi-value">6</div>
              <div className="landing-hero-vc__kpi-label">events in pipeline</div>
            </div>
          </div>

          <div className="landing-hero-vc__card landing-hero-vc__card--compact">
            <h3 className="landing-hero-vc__card-compact-title">Next 72 hours</h3>
            <div className="landing-hero-vc__list">
              {nextWindowRows.map((row) => (
                <div key={row.label} className="landing-hero-vc__list-row">
                  <span>{row.label}</span>
                  <span className="landing-hero-vc__list-state">{row.time}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
