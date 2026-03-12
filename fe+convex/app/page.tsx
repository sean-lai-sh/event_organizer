"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push("/dashboard");
    }
  }, [session, router]);

  if (session) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Navigation */}
      <nav className="flex items-center justify-between p-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-blue-600">Event Org</div>
        <div className="flex gap-4">
          <Link
            href="/login"
            className="px-4 py-2 text-zinc-700 hover:text-zinc-900 font-medium"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="space-y-8 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-zinc-900 leading-tight">
            Organize Events with
            <br />
            <span className="text-blue-600">Effortless Control</span>
          </h1>
          <p className="text-xl text-zinc-600 max-w-2xl mx-auto">
            Manage speakers, coordinate outreach, track communications, and
            monitor event progress all in one place. Streamline your event
            organization workflow.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Link
              href="/signup"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-lg"
            >
              Start Free
            </Link>
            <Link
              href="#features"
              className="px-6 py-3 border border-zinc-300 text-zinc-900 rounded-lg hover:bg-zinc-50 transition font-medium text-lg"
            >
              Learn More
            </Link>
          </div>
        </div>

        {/* Demo Cards */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <div className="bg-white rounded-xl p-8 shadow-lg border border-zinc-100 hover:shadow-xl transition">
            <div className="text-4xl mb-4">📅</div>
            <h3 className="text-xl font-bold text-zinc-900 mb-2">
              Manage Events
            </h3>
            <p className="text-zinc-600">
              Create, track, and organize events with milestones for speaker and
              room confirmations.
            </p>
          </div>

          <div className="bg-white rounded-xl p-8 shadow-lg border border-zinc-100 hover:shadow-xl transition">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-xl font-bold text-zinc-900 mb-2">
              Speaker Outreach
            </h3>
            <p className="text-zinc-600">
              Track speaker engagement, responses, and previous event
              participation all in one place.
            </p>
          </div>

          <div className="bg-white rounded-xl p-8 shadow-lg border border-zinc-100 hover:shadow-xl transition">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-xl font-bold text-zinc-900 mb-2">
              Email Threads
            </h3>
            <p className="text-zinc-600">
              Monitor all communications with speakers and manage conversations
              with automatic organization.
            </p>
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className="mt-32 space-y-12">
          <h2 className="text-4xl font-bold text-zinc-900 text-center">
            Key Features
          </h2>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="text-2xl">✓</div>
                <div>
                  <h4 className="font-bold text-lg text-zinc-900">
                    Real-time Dashboard
                  </h4>
                  <p className="text-zinc-600 mt-1">
                    See all your events, speakers, and communications at a
                    glance with live statistics.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="text-2xl">✓</div>
                <div>
                  <h4 className="font-bold text-lg text-zinc-900">
                    Speaker Tracking
                  </h4>
                  <p className="text-zinc-600 mt-1">
                    Track speaker status, previous events, and outreach progress
                    automatically.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="text-2xl">✓</div>
                <div>
                  <h4 className="font-bold text-lg text-zinc-900">
                    Communication Hub
                  </h4>
                  <p className="text-zinc-600 mt-1">
                    Centralized email thread management with status tracking and
                    quick actions.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="text-2xl">✓</div>
                <div>
                  <h4 className="font-bold text-lg text-zinc-900">
                    Progress Tracking
                  </h4>
                  <p className="text-zinc-600 mt-1">
                    Visual progress indicators for speaker confirmations and
                    event milestones.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="text-2xl">✓</div>
                <div>
                  <h4 className="font-bold text-lg text-zinc-900">
                    Team Collaboration
                  </h4>
                  <p className="text-zinc-600 mt-1">
                    Manage team members, assign speakers, and track ownership
                    effortlessly.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="text-2xl">✓</div>
                <div>
                  <h4 className="font-bold text-lg text-zinc-900">
                    Smart Search
                  </h4>
                  <p className="text-zinc-600 mt-1">
                    Quickly find events, speakers, and communications with
                    powerful filtering.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-32 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Organize Better?</h2>
          <p className="text-lg mb-8 opacity-90">
            Join your team and start managing events more efficiently today.
          </p>
          <Link
            href="/signup"
            className="inline-block px-8 py-3 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition font-bold text-lg"
          >
            Create Account →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 mt-32 py-8 text-center text-zinc-600">
        <p>&copy; 2026 Event Organizer. All rights reserved.</p>
      </footer>
    </main>
  );
}
