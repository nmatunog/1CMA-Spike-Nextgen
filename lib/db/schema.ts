import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  regionCode: text("region_code").notNull(),
  provinceSlug: text("province_slug").notNull(),
  resolvedPersona: text("resolved_persona").notNull(),
  email: text("email"),
  userId: text("user_id"),
});

export const candidates = pgTable("candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  score: integer("score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type LeadRow = typeof leads.$inferSelect;
export type CandidateRow = typeof candidates.$inferSelect;
