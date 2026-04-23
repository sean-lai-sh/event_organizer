/**
 * Apollo Adapter — interface + mock implementation for people search.
 *
 * Real implementation: plug in APOLLO_API_KEY and call Apollo.io People Search API.
 * Mock implementation: returns seeded fake candidates for local dev/demo.
 *
 * The adapter normalizes raw Apollo results into our CandidateProfile shape.
 */

import type { ApolloPersonRaw, CandidateProfile } from "../types";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ApolloSearchParams {
  titleKeywords: string[];
  keywords?: string[];
  locations?: string[];
  companyTypes?: string[];
  seniority?: string[];
  perPage?: number; // max 25 for MVP
}

export interface ApolloSearchResult {
  people: ApolloPersonRaw[];
  totalCount: number;
  query: string; // for dedup / audit
}

export interface IApolloAdapter {
  searchPeople(params: ApolloSearchParams): Promise<ApolloSearchResult>;
}

// ─── Normalizer (shared) ──────────────────────────────────────────────────────

/** Convert a raw Apollo person record into our canonical CandidateProfile */
export function normalizeApolloPerson(raw: ApolloPersonRaw): Omit<CandidateProfile, "canonicalHash"> {
  const firstName = raw.first_name?.trim() ?? "";
  const lastName = raw.last_name?.trim() ?? "";
  const fullName = raw.name?.trim() || `${firstName} ${lastName}`.trim();

  return {
    fullName,
    firstName,
    lastName,
    headline: raw.headline ?? raw.title,
    currentTitle: raw.title,
    companyName: raw.organization?.name,
    companyDomain: raw.organization?.primary_domain ?? raw.organization?.website_url,
    city: raw.city,
    region: raw.state,
    country: raw.country,
    linkedinUrl: raw.linkedin_url,
    email: raw.email,
    sourceSystem: "apollo",
    sourcePersonId: raw.id,
    sourceProfileUrl: raw.linkedin_url,
    bio: raw.biography,
    publicSpeakingEvidence: undefined,
    topicTags: [],
    industryTags: [],
    audienceTags: [],
    enrichmentStatus: "pending",
  };
}

// ─── Real adapter ─────────────────────────────────────────────────────────────

export class ApolloAdapter implements IApolloAdapter {
  private apiKey: string;
  private baseUrl = "https://api.apollo.io/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchPeople(params: ApolloSearchParams): Promise<ApolloSearchResult> {
    const payload = {
      api_key: this.apiKey,
      person_titles: params.titleKeywords,
      keywords: params.keywords?.join(" "),
      person_locations: params.locations,
      organization_num_employees_ranges: params.companyTypes,
      person_seniorities: params.seniority,
      page: 1,
      per_page: params.perPage ?? 20,
    };

    const res = await fetch(`${this.baseUrl}/mixed_people/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apollo API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const queryStr = params.titleKeywords.join(", ");

    return {
      people: (data.people ?? []) as ApolloPersonRaw[],
      totalCount: data.pagination?.total_entries ?? 0,
      query: queryStr,
    };
  }
}

// ─── Mock adapter (for local dev / CI) ───────────────────────────────────────

const MOCK_PEOPLE: ApolloPersonRaw[] = [
  {
    id: "mock-001",
    first_name: "Priya",
    last_name: "Nair",
    name: "Priya Nair",
    title: "Co-founder & CEO",
    headline: "Building the future of climate fintech",
    linkedin_url: "https://linkedin.com/in/priyanair",
    email: "priya@example.com",
    city: "San Francisco",
    state: "CA",
    country: "US",
    organization: { name: "GreenLedger", primary_domain: "greenledger.io" },
    biography:
      "Priya co-founded GreenLedger after 5 years at Goldman Sachs. She has spoken at TechCrunch Disrupt and Stanford GSB.",
  },
  {
    id: "mock-002",
    first_name: "Marcus",
    last_name: "Chen",
    name: "Marcus Chen",
    title: "Head of Product",
    headline: "0→1 product at Rippling",
    linkedin_url: "https://linkedin.com/in/marcuschen",
    city: "New York",
    state: "NY",
    country: "US",
    organization: { name: "Rippling", primary_domain: "rippling.com" },
    biography:
      "Marcus led product for Rippling's payroll product from 50 to 500 employees. Former PM at Stripe.",
  },
  {
    id: "mock-003",
    first_name: "Aisha",
    last_name: "Okafor",
    name: "Aisha Okafor",
    title: "Founding Engineer",
    headline: "Ex-Figma, now building in AI",
    linkedin_url: "https://linkedin.com/in/aishaokafor",
    city: "Austin",
    state: "TX",
    country: "US",
    organization: { name: "Stealth AI Startup", primary_domain: "stealthai.com" },
    biography: "Founding engineer at a seed-stage AI startup. Previously at Figma and Vercel.",
  },
  {
    id: "mock-004",
    first_name: "Daniel",
    last_name: "Park",
    name: "Daniel Park",
    title: "General Partner",
    headline: "Early-stage investor in B2B SaaS",
    linkedin_url: "https://linkedin.com/in/danielpark",
    city: "San Francisco",
    state: "CA",
    country: "US",
    organization: { name: "Sequoia Capital", primary_domain: "sequoiacap.com" },
    biography:
      "GP at Sequoia focused on early-stage B2B SaaS. Guest lecturer at Stanford and UC Berkeley.",
  },
  {
    id: "mock-005",
    first_name: "Sofia",
    last_name: "Martinez",
    name: "Sofia Martinez",
    title: "VP of Growth",
    headline: "Growth @ Series B, previously Duolingo",
    linkedin_url: "https://linkedin.com/in/sofiamartinez",
    city: "New York",
    state: "NY",
    country: "US",
    organization: { name: "Lingo Labs", primary_domain: "lingolabs.com" },
    biography:
      "Sofia built Duolingo's referral engine and now leads growth at Lingo Labs. Speaks at SaaStock and Growth Summit.",
  },
  {
    id: "mock-006",
    first_name: "Kwame",
    last_name: "Asante",
    name: "Kwame Asante",
    title: "CTO",
    headline: "Scaling engineering at hypergrowth startups",
    linkedin_url: "https://linkedin.com/in/kwameasante",
    city: "Boston",
    state: "MA",
    country: "US",
    organization: { name: "Helix Health", primary_domain: "helixhealth.com" },
    biography:
      "Kwame scaled engineering at two Y Combinator companies from seed to Series C. Regular speaker at QCon.",
  },
  {
    id: "mock-007",
    first_name: "Rachel",
    last_name: "Kim",
    name: "Rachel Kim",
    title: "Director of Partnerships",
    headline: "GTM & partnerships for developer tools",
    linkedin_url: "https://linkedin.com/in/rachelkim",
    city: "Seattle",
    state: "WA",
    country: "US",
    organization: { name: "Vercel", primary_domain: "vercel.com" },
    biography:
      "Rachel leads developer partnerships at Vercel. Previously at GitHub and Twilio.",
  },
  {
    id: "mock-008",
    first_name: "James",
    last_name: "Thornton",
    name: "James Thornton",
    title: "Founder",
    headline: "2x founder, now at YC",
    linkedin_url: "https://linkedin.com/in/jamesthornton",
    city: "San Francisco",
    state: "CA",
    country: "US",
    organization: { name: "Y Combinator", primary_domain: "ycombinator.com" },
    biography:
      "James sold his second startup and joined YC as a partner. Loves talking about fundraising and PMF.",
  },
];

export class MockApolloAdapter implements IApolloAdapter {
  async searchPeople(params: ApolloSearchParams): Promise<ApolloSearchResult> {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 200));

    const limit = params.perPage ?? 20;
    const people = MOCK_PEOPLE.slice(0, Math.min(limit, MOCK_PEOPLE.length));

    return {
      people,
      totalCount: MOCK_PEOPLE.length,
      query: params.titleKeywords.join(", "),
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createApolloAdapter(): IApolloAdapter {
  const apiKey = process.env.APOLLO_API_KEY;
  if (apiKey && apiKey !== "mock") {
    return new ApolloAdapter(apiKey);
  }
  return new MockApolloAdapter();
}
