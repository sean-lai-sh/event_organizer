/**
 * HubSpot Adapter — interface + mock for CRM sync.
 *
 * Real implementation: plug in HUBSPOT_ACCESS_TOKEN.
 * Mock implementation: logs operations, returns fake IDs.
 *
 * The adapter handles:
 * - Upserting contacts (candidates)
 * - Creating/updating custom speaker records
 * - Associating records
 */

import type { HubSpotContactPayload } from "../types";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface HubSpotUpsertResult {
  crmRecordId: string;
  created: boolean;
}

export interface IHubSpotAdapter {
  upsertContact(payload: HubSpotContactPayload): Promise<HubSpotUpsertResult>;
  addNoteToContact(contactId: string, noteBody: string): Promise<{ noteId: string }>;
  updateContactProperty(contactId: string, key: string, value: string | number): Promise<void>;
}

// ─── Real adapter ─────────────────────────────────────────────────────────────

export class HubSpotAdapter implements IHubSpotAdapter {
  private accessToken: string;
  private baseUrl = "https://api.hubapi.com";

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  async upsertContact(payload: HubSpotContactPayload): Promise<HubSpotUpsertResult> {
    // Try to find by email first
    if (payload.email) {
      const searchRes = await fetch(
        `${this.baseUrl}/crm/v3/objects/contacts/search`,
        {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({
            filterGroups: [
              {
                filters: [
                  { propertyName: "email", operator: "EQ", value: payload.email },
                ],
              },
            ],
          }),
        }
      );

      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.results?.length > 0) {
          const existingId = data.results[0].id;
          // Update existing
          await fetch(`${this.baseUrl}/crm/v3/objects/contacts/${existingId}`, {
            method: "PATCH",
            headers: this.headers,
            body: JSON.stringify({ properties: payload }),
          });
          return { crmRecordId: existingId, created: false };
        }
      }
    }

    // Create new contact
    const createRes = await fetch(`${this.baseUrl}/crm/v3/objects/contacts`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ properties: payload }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`HubSpot create contact failed: ${createRes.status} ${text.slice(0, 200)}`);
    }

    const created = await createRes.json();
    return { crmRecordId: created.id, created: true };
  }

  async addNoteToContact(contactId: string, noteBody: string): Promise<{ noteId: string }> {
    const res = await fetch(`${this.baseUrl}/crm/v3/objects/notes`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        properties: {
          hs_note_body: noteBody,
          hs_timestamp: Date.now(),
        },
        associations: [
          {
            to: { id: contactId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`HubSpot note creation failed: ${res.status}`);
    }

    const data = await res.json();
    return { noteId: data.id };
  }

  async updateContactProperty(contactId: string, key: string, value: string | number): Promise<void> {
    await fetch(`${this.baseUrl}/crm/v3/objects/contacts/${contactId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({ properties: { [key]: value } }),
    });
  }
}

// ─── Mock adapter ─────────────────────────────────────────────────────────────

let mockIdCounter = 1000;

export class MockHubSpotAdapter implements IHubSpotAdapter {
  async upsertContact(payload: HubSpotContactPayload): Promise<HubSpotUpsertResult> {
    await new Promise((r) => setTimeout(r, 100));
    const id = `mock-hs-${++mockIdCounter}`;
    console.log(`[MockHubSpot] Upserted contact: ${payload.firstname} ${payload.lastname} → ${id}`);
    return { crmRecordId: id, created: true };
  }

  async addNoteToContact(contactId: string, noteBody: string): Promise<{ noteId: string }> {
    await new Promise((r) => setTimeout(r, 50));
    const noteId = `mock-note-${++mockIdCounter}`;
    console.log(`[MockHubSpot] Note added to ${contactId}: ${noteBody.slice(0, 60)}...`);
    return { noteId };
  }

  async updateContactProperty(contactId: string, key: string, value: string | number): Promise<void> {
    console.log(`[MockHubSpot] Updated ${contactId}.${key} = ${value}`);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createHubSpotAdapter(): IHubSpotAdapter {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (token && token !== "mock") {
    return new HubSpotAdapter(token);
  }
  return new MockHubSpotAdapter();
}
