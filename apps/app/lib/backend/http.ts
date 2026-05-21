import { NextResponse } from "next/server";
import { UserInputError } from "@/lib/user-input-error";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

type ErrorLike = {
  code?: unknown;
  constraint?: unknown;
  detail?: unknown;
  message?: unknown;
};

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function errorText(error: unknown, key: keyof ErrorLike) {
  return typeof error === "object" && error !== null && key in error ? String((error as ErrorLike)[key] || "") : "";
}

function userMessage(error: unknown) {
  if (error instanceof UserInputError) return error.message;

  const message = error instanceof Error ? error.message : "Unexpected backend error";
  const code = errorText(error, "code");
  const constraint = errorText(error, "constraint");
  const detail = errorText(error, "detail");
  const lowerMessage = message.toLowerCase();
  const lowerDetail = detail.toLowerCase();

  if (message === "Authentication is required.") return message;

  if (constraint === "funding_request_votes_request_id_voter_wallet_key") {
    return "You have already voted on this funding request. Each council wallet can approve or reject a request only once.";
  }
  if (constraint.includes("funding_request_votes") && code === "23503") {
    return "This funding request could not be found. Refresh the page and try again.";
  }
  if (constraint.includes("funding_requests") && code === "23503") {
    return "The mission or funding request no longer exists. Refresh the page and try again.";
  }
  if (constraint.includes("mission") && code === "23505") {
    return "A mission with these launch details already exists. Refresh the page to see the latest mission state.";
  }
  if (code === "23505") {
    return "This action was already submitted. Refresh the page to see the latest state before trying again.";
  }
  if (code === "23503") {
    return "This action refers to data that no longer exists. Refresh the page and try again.";
  }
  if (code === "23514") {
    return "One of the submitted values is not allowed for this action. Check the form and try again.";
  }
  if (code === "23502") {
    return "A required value is missing. Check the form and try again.";
  }
  if (code === "22001") {
    return "One of the submitted values is too long. Shorten it and try again.";
  }
  if (code === "22P02") {
    return "One of the submitted values has an invalid format. Check the form and try again.";
  }
  if (lowerMessage.includes("failed to fetch") || lowerMessage.includes("fetch failed")) {
    return "The app could not reach a required service. Check your connection and try again.";
  }
  if (lowerMessage.includes("database_url") || lowerMessage.includes("solana_rpc_url")) {
    return "This backend service is not fully configured yet. Contact the project operator before trying again.";
  }
  if (lowerMessage.includes("duplicate key") && lowerDetail.includes("funding_request_votes")) {
    return "You have already voted on this funding request. Each council wallet can approve or reject a request only once.";
  }

  if (isProductionRuntime()) {
    return "The request could not be completed. Refresh the page and try again.";
  }

  return message;
}

export function fail(error: unknown, status = 400) {
  const message = userMessage(error);
  if (status >= 500) {
    const logMessage = error instanceof Error ? error.message : String(error);
    console.error("API request failed", { status, error: logMessage });
  }
  if (message === "Authentication is required.") {
    return NextResponse.json({ error: message }, { status: 401 });
  }
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (text.length > 1024 * 1024) throw new Error("The request body is too large.");
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("The request body is not valid JSON. Check the submitted data and try again.");
  }
}
