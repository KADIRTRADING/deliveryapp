import "server-only";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, assertProductionCredentials } from "@/lib/env";
import { ApiError } from "@/lib/api-error";

/**
 * StorageProvider abstraction.
 *
 * Per "Do NOT rely on local disk storage in production. Create an
 * S3-compatible StorageProvider abstraction": all restaurant/product/
 * category image storage goes through this interface. The concrete
 * implementation is chosen purely by `STORAGE_PROVIDER`, matching the
 * pattern used by MapProvider/SmsProvider elsewhere in this codebase.
 *
 * Uploads are handled via short-lived, scoped presigned PUT URLs rather
 * than proxying file bytes through our own server — this keeps large image
 * uploads off the Next.js request/response cycle entirely and avoids
 * needing to raise API body-size limits for what is otherwise a narrow,
 * well-understood operation.
 */

export const ALLOWED_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

export interface PresignedUpload {
  /** The URL the client should PUT the raw file bytes to. */
  uploadUrl: string;
  /** The key (path) the object will be stored under. */
  key: string;
  /** The public URL the object will be reachable at once uploaded. */
  publicUrl: string;
  /** Seconds until `uploadUrl` expires. */
  expiresInSeconds: number;
}

export interface StorageProvider {
  /**
   * Generate a presigned URL for the client to upload a single file to.
   * `folder` scopes the object key (e.g. "restaurants/logos",
   * "products/images") so different asset types are organized in the
   * bucket and can have different lifecycle/CDN rules applied later.
   */
  createPresignedUpload(
    folder: string,
    contentType: AllowedImageContentType,
  ): Promise<PresignedUpload>;

  /** Permanently delete an object by its key (e.g. when replacing an image). */
  deleteObject(key: string): Promise<void>;
}

function generateObjectKey(folder: string, contentType: AllowedImageContentType): string {
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
  return `${folder}/${randomUUID()}.${extension}`;
}

/**
 * In-memory / no-op adapter for local development and tests when no real
 * S3-compatible endpoint is configured. Returns syntactically valid but
 * non-functional URLs — this is explicitly NOT wired to any persistence, so
 * it must never be selected in production (enforced in getStorageProvider).
 */
class MockStorageProvider implements StorageProvider {
  async createPresignedUpload(
    folder: string,
    contentType: AllowedImageContentType,
  ): Promise<PresignedUpload> {
    const key = generateObjectKey(folder, contentType);
    return {
      uploadUrl: `http://localhost:9000/mock-upload/${key}`,
      key,
      publicUrl: `http://localhost:9000/mock-bucket/${key}`,
      expiresInSeconds: 900,
    };
  }

  async deleteObject(_key: string): Promise<void> {
    // no-op
  }
}

/**
 * S3-compatible adapter. Works against real AWS S3 as well as any
 * S3-compatible endpoint (MinIO for local Docker development, DigitalOcean
 * Spaces, etc.) via S3_ENDPOINT + S3_FORCE_PATH_STYLE.
 */
class S3StorageProvider implements StorageProvider {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }

  async createPresignedUpload(
    folder: string,
    contentType: AllowedImageContentType,
  ): Promise<PresignedUpload> {
    const key = generateObjectKey(folder, contentType);
    const expiresInSeconds = 900;

    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    const publicUrl = `${(env.S3_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")}/${key}`;

    return { uploadUrl, key, publicUrl, expiresInSeconds };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
}

let cachedProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cachedProvider) return cachedProvider;

  if (env.STORAGE_PROVIDER === "s3") {
    assertProductionCredentials("S3 storage", [
      env.S3_BUCKET,
      env.S3_ACCESS_KEY_ID,
      env.S3_SECRET_ACCESS_KEY,
      env.S3_PUBLIC_BASE_URL,
    ]);
    cachedProvider = new S3StorageProvider();
  } else {
    cachedProvider = new MockStorageProvider();
  }
  return cachedProvider;
}

export function assertAllowedImageContentType(
  contentType: string,
): contentType is AllowedImageContentType {
  if (!ALLOWED_IMAGE_CONTENT_TYPES.includes(contentType as AllowedImageContentType)) {
    throw ApiError.badRequest(
      `Unsupported image type "${contentType}". Allowed: ${ALLOWED_IMAGE_CONTENT_TYPES.join(", ")}`,
    );
  }
  return true;
}
