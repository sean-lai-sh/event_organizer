"""
Manual smoke test — sends a real email via AgentMail to verify the pipeline.
Not run by pytest (no test_ prefix).

Usage:
    AGENTMAIL_API_KEY=<key> uv run python tests/send_email_local.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from apps.mcp import service as mcp_service


async def main() -> None:
    result = await mcp_service.send_outreach_email(
        recipient_name="Sean Lai",
        recipient_email="seanlai@nyu.edu",
        subject="[Test] AgentMail smoke test",
        message_body="This is a local smoke test to verify the send_outreach_email pipeline works.",
        signature="— TechNYU Events Bot",
    )
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
