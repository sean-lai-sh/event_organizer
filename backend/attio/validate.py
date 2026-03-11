"""Validate that the Attio client can reach the API using ATTIO_KEY."""
import asyncio
import os
import sys


async def main() -> None:
    token = os.environ.get("ATTIO_KEY")
    if not token:
        print("ERROR: ATTIO_KEY env var is not set")
        sys.exit(1)

    import httpx
    from backend.attio.client import AttioClient

    print(f"ATTIO_KEY found (length={len(token)})")

    print("Step 1: Verifying token with /self endpoint...")
    try:
        resp = httpx.get(
            "https://api.attio.com/v2/self",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        resp.raise_for_status()
        workspace = resp.json().get("data", {})
        print(f"  Token valid — workspace: {workspace.get('workspace', {}).get('name', '?')}")
    except Exception as exc:
        print(f"ERROR at /self: {exc}")
        sys.exit(1)

    print("Step 2: Fetching up to 1 contact from Attio...")
    try:
        async with AttioClient() as client:
            records = await client.search_contacts(
                filter_={"$and": []}, limit=1
            )
        print(f"SUCCESS: Attio API reachable — got {len(records)} record(s)")
    except Exception as exc:
        print(f"ERROR querying contacts: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
