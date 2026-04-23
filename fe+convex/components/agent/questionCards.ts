import type {
  ChoiceRequestPayload,
  FormRequestPayload,
  FormRequestField,
} from "./types";

function normalizeValue(value: FormDataEntryValue | boolean | undefined) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value.trim();
  return "";
}

function initialFieldValue(field: FormRequestField) {
  if (field.inputType === "checkbox") {
    return field.defaultValue === true;
  }
  return typeof field.defaultValue === "string" ? field.defaultValue : "";
}

export function getInitialFormValues(fields: FormRequestField[]) {
  return Object.fromEntries(fields.map((field) => [field.key, initialFieldValue(field)]));
}

export function serializeFormRequestSubmission(
  payload: FormRequestPayload,
  values: Record<string, FormDataEntryValue | boolean | undefined>
) {
  const lines = [
    "[agent-form-response]",
    `entity: ${payload.entity}`,
    `mode: ${payload.mode}`,
    `request_id: ${payload.requestId}`,
  ];

  for (const field of payload.fields) {
    lines.push(`${field.key}: ${normalizeValue(values[field.key])}`);
  }

  lines.push("[/agent-form-response]");
  return lines.join("\n");
}

export function serializeChoiceRequestSubmission(
  payload: ChoiceRequestPayload,
  choiceId: string
) {
  const choice = payload.choices.find((item) => item.id === choiceId);
  return [
    "[agent-choice-response]",
    `entity: ${payload.entity}`,
    `mode: ${payload.mode}`,
    `request_id: ${payload.requestId}`,
    `choice_id: ${choiceId}`,
    `choice_label: ${choice?.label ?? ""}`,
    "[/agent-choice-response]",
  ].join("\n");
}
