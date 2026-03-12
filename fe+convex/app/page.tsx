export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 p-10">
      <h1 className="text-4xl font-bold mb-8">Event Organizer Dashboard</h1>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="p-6 bg-white rounded-xl shadow">
          <h2 className="text-xl font-semibold">Upcoming Events</h2>
          <p className="text-zinc-500 mt-2">
            View and manage scheduled events.
          </p>
        </div>

        <div className="p-6 bg-white rounded-xl shadow">
          <h2 className="text-xl font-semibold">Speakers</h2>
          <p className="text-zinc-500 mt-2">
            Track speaker outreach and confirmations.
          </p>
        </div>

        <div className="p-6 bg-white rounded-xl shadow">
          <h2 className="text-xl font-semibold">Email Threads</h2>
          <p className="text-zinc-500 mt-2">
            Monitor inbound and outbound communication.
          </p>
        </div>
      </div>
    </main>
  );
}
