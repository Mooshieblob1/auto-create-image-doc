import { Client, Databases, ID, Storage } from 'node-appwrite';
import * as fs from 'node:fs/promises';
import * as exifr from 'exifr';
import { extract } from 'png-metadata-extractor';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const storage = new Storage(client);
  const databases = new Databases(client);

  const BUCKET_ID = process.env.BUCKET_ID;
  const DATABASE_ID = process.env.DATABASE_ID;
  const COLLECTION_ID = process.env.COLLECTION_ID;

  try {
    const files = await storage.listFiles(BUCKET_ID);

    for (const file of files.files) {
      const fileId = file.$id;
      const buffer = await storage.getFileDownload(BUCKET_ID, fileId);
      const tmpFilePath = `/tmp/${fileId}`;
      await fs.writeFile(tmpFilePath, Buffer.from(buffer));

      let metadata = {};

      if (file.mimeType === 'image/png') {
        const raw = await extract(tmpFilePath);
        metadata = raw?.tEXt ?? {};
      } else {
        metadata = await exifr.parse(tmpFilePath, { userComment: true }) || {};
      }

      const prompt = metadata?.prompt || metadata?.description || metadata?.UserComment || 'No prompt';
      const model = metadata?.model || metadata?.Model || 'Unknown';
      const software = metadata?.software || metadata?.Software || 'Unknown';

      await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
        imageId: fileId,
        prompt,
        model,
        software
      });

      await fs.unlink(tmpFilePath);
    }

    return res.json({ success: true, message: "Images processed successfully." });

  } catch (err) {
    const message = typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : JSON.stringify(err);

    error("Function failed: " + message);
    return res.json({ success: false, error: message });
  }
};
