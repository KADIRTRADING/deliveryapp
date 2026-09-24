import { z } from "zod";
import { ALLOWED_IMAGE_CONTENT_TYPES } from "@/modules/storage/storage-provider";

export const presignUploadSchema = z.object({
  folder: z.enum([
    "restaurants/logos",
    "restaurants/covers",
    "products/images",
    "categories/icons",
  ]),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
});
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;
