import { Client, Storage, Databases } from "node-appwrite";
import exifr from "exifr";
import { parse as parsePngText } from "png-metadata-extractor";

export default async ({ variables, res }) => {
  const event = JSON.parse(variables.APPWRITE_FUNCTION_EVENT_DATA);
  const { $id: fileId, bucketId, mimeType } = event;

  const client = new Client()
    .setEndpoint(variables.APPWRITE_ENDPOINT)
    .setProject(variables.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(variables.APPWRITE_API_KEY);

  const storage = new Storage(client);
  const databases = new Databases(client);

  // Step 1: Download image file into buffer
  const fileStream = await storage.getFileDownload(bucketId, fileId);
  const chunks = [];
  for await (const chunk of fileStream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  // Step 2: Parse metadata
  let metadata = {};
  if (mimeType === "image/png") {
    // Parse PNG "parameters" field (for SD users)
    const pngChunks = parsePngText(buffer);
    const params = pngChunks.find(c => c.keyword === "parameters")?.text;
    if (params) {
      params.split(/\n/).forEach(line => {
        const [key, ...rest] = line.split(/:\s*/);
        if (key && rest.length > 0) {
          metadata[key.toLowerCase().replace(/ /g, "_")] = rest.join(": ");
        }
      });
    }
  } else {
    // Parse EXIF from JPEG/WebP/HEIC
    metadata = await exifr.parse(buffer, { translateValues: false });
  }

  // Step 3: Create or update DB document
  const docData = {
    file_id: fileId,
    bucket_id: bucketId,
    mime_type: mimeType,
    metadata,
    created_at: new Date().toISOString()
  };

  try {
    await databases.createDocument(
      variables.DB_ID,
      variables.COLLECTION_ID,
      fileId,
      docData
    );
    return res.json({ status: "created", metadata_keys: Object.keys(metadata) });
  } catch (e) {
    return res.json({ error: e.message });
  }
};
