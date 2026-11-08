-- Herramientas y permisos por usuario. Todo aditivo: no se altera ninguna
-- columna existente ni se borran datos. Idempotente para poder aplicarlo
-- sobre bases donde las tablas ya se crearon con `prisma db push`.

ALTER TABLE "labor_settings"
  ADD COLUMN IF NOT EXISTS "require_attendance_to_open_cash" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "app_features" (
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "updated_by" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_features_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "user_permission_overrides" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "effect" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_permission_overrides_user_id_permission_key"
  ON "user_permission_overrides"("user_id", "permission");
CREATE INDEX IF NOT EXISTS "user_permission_overrides_user_id_idx"
  ON "user_permission_overrides"("user_id");

CREATE TABLE IF NOT EXISTS "permission_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" TEXT NOT NULL,
  "target_user_id" TEXT,
  "kind" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "before" TEXT,
  "after" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permission_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "permission_audit_logs_created_at_idx"
  ON "permission_audit_logs"("created_at");
CREATE INDEX IF NOT EXISTS "permission_audit_logs_target_user_id_created_at_idx"
  ON "permission_audit_logs"("target_user_id", "created_at");
