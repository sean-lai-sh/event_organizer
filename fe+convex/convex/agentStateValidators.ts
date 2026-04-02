import { v } from "convex/values";

export const agentContentBlockValidator = v.object({
  kind: v.string(),
  label: v.optional(v.string()),
  text: v.optional(v.string()),
  mime_type: v.optional(v.string()),
  data_json: v.optional(v.string()),
  url: v.optional(v.string()),
});

export const agentContentBlocksValidator = v.array(agentContentBlockValidator);
