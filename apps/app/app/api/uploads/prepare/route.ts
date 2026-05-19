import { storeObject } from "@singularity/storage";
import { fail, ok } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/json"]);
const allowedPurposes = new Set(["mission-image", "token-image", "profile-avatar", "metadata"]);
const maxBytes = 5 * 1024 * 1024;
const maxJsonBytes = 256 * 1024;

function safeFilename(name: string) {
  const normalized = name.replace(/[/\\\0]/g, "-").replace(/[^a-zA-Z0-9._-]/g, "-");
  return normalized.slice(0, 96) || "upload";
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const formData = await request.formData();
    const file = formData.get("file");
    const purpose = String(formData.get("purpose") || "metadata");

    if (!(file instanceof File)) throw new Error("file is required.");
    if (!allowedPurposes.has(purpose)) throw new Error("Unsupported upload purpose.");
    if (!allowedTypes.has(file.type)) throw new Error("Unsupported file type.");
    if (file.size > maxBytes) throw new Error("File is too large. Maximum size is 5MB.");
    if (file.type === "application/json" && file.size > maxJsonBytes) throw new Error("JSON metadata is too large. Maximum size is 256KB.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await storeObject({
      keyPrefix: `${purpose}/${session.address}`,
      filename: safeFilename(file.name),
      contentType: file.type,
      bytes,
    });

    return ok({ upload: stored }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
