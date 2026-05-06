import { storeObject } from "@singularity/storage";
import { fail, ok } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "application/json"]);
const maxBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const formData = await request.formData();
    const file = formData.get("file");
    const purpose = String(formData.get("purpose") || "metadata");

    if (!(file instanceof File)) throw new Error("file is required.");
    if (!allowedTypes.has(file.type)) throw new Error("Unsupported file type.");
    if (file.size > maxBytes) throw new Error("File is too large. Maximum size is 5MB.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await storeObject({
      keyPrefix: `${purpose}/${session.address}`,
      filename: file.name,
      contentType: file.type,
      bytes,
    });

    return ok({ upload: stored }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
