import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  regionCode: text("region_code").notNull(),
  provinceSlug: text("province_slug").notNull(),
  resolvedPersona: text("resolved_persona").notNull(),
  email: text("email"),
  userId: text("user_id"),
});

export type LeadRow = typeof leads.$inferSelect;
