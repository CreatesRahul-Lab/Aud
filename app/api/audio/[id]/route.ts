import { NextResponse } from "next/server";
import { getAudioDownloadStream } from "@/lib/audio/gridfs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const stream = await getAudioDownloadStream(id);
  const chunks: Uint8Array[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk as Uint8Array);
  }

  return new NextResponse(Buffer.concat(chunks), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
    },
  });
}
