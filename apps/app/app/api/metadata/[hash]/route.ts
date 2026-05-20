import { readMissionTokenMetadataByHash } from "@/lib/backend/mission-token-metadata";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ hash: string }> }) {
  try {
    const { hash } = await context.params;
    const metadata = await readMissionTokenMetadataByHash(hash.replace(/\.json$/i, ""));
    if (!metadata) return new Response("Not found", { status: 404 });

    return new Response(metadata.bytes, {
      headers: {
        "Content-Type": metadata.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
