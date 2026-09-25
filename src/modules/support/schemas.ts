import { z } from "zod";

export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  orderId: z.string().uuid().optional(),
  body: z.string().trim().min(1).max(4000),
});
