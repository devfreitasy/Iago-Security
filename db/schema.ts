import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaceState = sqliteTable(
  "workspace_state",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_workspace_state_owner_id").on(table.ownerId)],
);
