import { GridFSBucket, ObjectId } from "mongodb";
import { getDb } from "../mongodb/client";

export async function uploadAudioAsset(params: { ownerId: string; fileName: string; contentType: string; bytes: Buffer }) {
  const db = await getDb();
  const bucket = new GridFSBucket(db, { bucketName: "audioAssets" });
  const uploadStream = bucket.openUploadStream(params.fileName, {
    contentType: params.contentType,
    metadata: { ownerId: new ObjectId(params.ownerId) },
  });

  await new Promise<void>((resolve, reject) => {
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve());
    uploadStream.end(params.bytes);
  });

  return uploadStream.id.toString();
}

export async function getAudioDownloadStream(fileId: string) {
  const db = await getDb();
  const bucket = new GridFSBucket(db, { bucketName: "audioAssets" });
  return bucket.openDownloadStream(new ObjectId(fileId));
}
