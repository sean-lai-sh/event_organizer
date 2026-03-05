"""Quick smoke test — fetches live data from HubSpot using HUBSPOT_PAT."""
import asyncio
import json
import os
import sys

# Allow running from any directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.hubspot.client import HubSpotClient


async def main() -> None:
    async with HubSpotClient() as hs:
        # 1. List first 5 contacts
        print("\n=== Contacts (first 5) ===")
        contacts = await hs.search_contacts(
            filters=[],
            properties=["firstname", "lastname", "email"],
            limit=5,
        )
        for c in contacts:
            print(json.dumps(c["properties"], indent=2))

        # 2. List contact properties
        print("\n=== Contact properties ===")
        props = await hs.list_properties("contacts")
        print(f"Total properties: {len(props)}")
        for p in props[:10]:
            print(f"  {p['name']} ({p['type']}) — {p.get('label', '')}")


if __name__ == "__main__":
    asyncio.run(main())
