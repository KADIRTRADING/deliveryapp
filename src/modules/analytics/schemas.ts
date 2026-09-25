import { z } from "zod";

/**
 * Shared date-range filter for every analytics endpoint, per "Support
 * date-range filtering." Both bounds are optional — omitting `from` means
 * "since the beginning of data", omitting `to` means "through now."
 */
export const dateRangeQuerySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && new Date(data.to) < new Date(data.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`to` must not be before `from`.",
        path: ["to"],
      });
    }
  });
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export function resolveDateRange(query: DateRangeQuery): { from: Date; to: Date } {
  return {
    from: query.from ? new Date(query.from) : new Date(0),
    to: query.to ? new Date(query.to) : new Date(),
  };
}
