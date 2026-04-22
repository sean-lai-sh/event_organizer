import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

function convex() {
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
}

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const state = await convex().query(api.agentState.getThreadState, {
    external_id: threadId,
  });

  if (!state) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json(state);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json(
      { error: "Title is required and cannot be empty" },
      { status: 400 }
    );
  }

  try {
    await convex().mutation(api.agent.renameThread, {
      external_id: threadId,
      title,
    });

    // Return the updated thread in the same shape the adapter expects
    const state = await convex().query(api.agentState.getThreadState, {
      external_id: threadId,
    });

    if (!state) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json(state.thread);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to rename thread";
    const status = message === "Thread not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;

  try {
    await convex().mutation(api.agent.deleteThread, {
      external_id: threadId,
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete thread";
    const status = message === "Thread not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
