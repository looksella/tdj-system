-- Additive rollout: legacy employees retain their existing fixed schedule.
ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "schedule_type" VARCHAR(20) NOT NULL DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS "schedule_pattern_id" UUID,
  ADD COLUMN IF NOT EXISTS "schedule_anchor_date" DATE;

UPDATE "employees"
SET "schedule_type" = 'FIXED'
WHERE "schedule_type" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_schedule_type_check'
  ) THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_schedule_type_check"
      CHECK ("schedule_type" IN ('FIXED', 'ROTATING'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "shifts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "start_time" TIME NOT NULL,
  "end_time" TIME NOT NULL,
  "break_duration_minutes" INTEGER NOT NULL DEFAULT 60,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "shifts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shifts_name_key" UNIQUE ("name"),
  CONSTRAINT "shifts_break_duration_minutes_check" CHECK ("break_duration_minutes" >= 0)
);

CREATE TABLE IF NOT EXISTS "shift_patterns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "cycle_days" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shift_patterns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shift_patterns_name_key" UNIQUE ("name"),
  CONSTRAINT "shift_patterns_cycle_days_check" CHECK ("cycle_days" > 0)
);

CREATE TABLE IF NOT EXISTS "shift_pattern_details" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pattern_id" UUID NOT NULL,
  "day_sequence" INTEGER NOT NULL,
  "shift_id" UUID,
  "is_rest_day" BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT "shift_pattern_details_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shift_pattern_details_pattern_id_day_sequence_key" UNIQUE ("pattern_id", "day_sequence"),
  CONSTRAINT "shift_pattern_details_pattern_id_fkey" FOREIGN KEY ("pattern_id")
    REFERENCES "shift_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shift_pattern_details_shift_id_fkey" FOREIGN KEY ("shift_id")
    REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shift_pattern_details_rest_shift_check" CHECK ("is_rest_day" = ("shift_id" IS NULL))
);

CREATE TABLE IF NOT EXISTS "employee_rosters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "shift_id" UUID,
  "date" DATE NOT NULL,
  "is_override" BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT "employee_rosters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_rosters_employee_id_date_key" UNIQUE ("employee_id", "date"),
  CONSTRAINT "employee_rosters_employee_id_fkey" FOREIGN KEY ("employee_id")
    REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "employee_rosters_shift_id_fkey" FOREIGN KEY ("shift_id")
    REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_schedule_pattern_id_fkey'
  ) THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_schedule_pattern_id_fkey"
      FOREIGN KEY ("schedule_pattern_id") REFERENCES "shift_patterns"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_rotating_schedule_fields_check'
  ) THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_rotating_schedule_fields_check"
      CHECK (
        "schedule_type" <> 'ROTATING'
        OR ("schedule_pattern_id" IS NOT NULL AND "schedule_anchor_date" IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "employees_schedule_pattern_id_idx"
  ON "employees"("schedule_pattern_id");
CREATE INDEX IF NOT EXISTS "shift_pattern_details_shift_id_idx"
  ON "shift_pattern_details"("shift_id");
CREATE INDEX IF NOT EXISTS "employee_rosters_shift_id_idx"
  ON "employee_rosters"("shift_id");

ALTER TABLE "labor_settings"
  ADD COLUMN IF NOT EXISTS "minimum_rest_hours" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "week_starts_on" INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'labor_settings_minimum_rest_hours_check'
  ) THEN
    ALTER TABLE "labor_settings"
      ADD CONSTRAINT "labor_settings_minimum_rest_hours_check"
      CHECK ("minimum_rest_hours" >= 8);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'labor_settings_week_starts_on_check'
  ) THEN
    ALTER TABLE "labor_settings"
      ADD CONSTRAINT "labor_settings_week_starts_on_check"
      CHECK ("week_starts_on" IN (0, 1));
  END IF;
END $$;

-- Seed the two base shifts and cycle templates. Re-running this migration is safe.
INSERT INTO "shifts" ("name", "start_time", "end_time", "break_duration_minutes")
VALUES
  ('Diurno', '08:00', '17:00', 60),
  ('Nocturno', '19:00', '03:00', 60)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "shift_patterns" ("name", "cycle_days")
VALUES ('Rotativo 5x2 diurno', 7), ('Semana A/B diurna y nocturna', 14)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "shift_pattern_details" ("pattern_id", "day_sequence", "shift_id", "is_rest_day")
SELECT pattern.id, sequence.day_sequence, shift.id, sequence.is_rest_day
FROM (
  SELECT 'Rotativo 5x2 diurno'::VARCHAR AS pattern_name,
         days.day_sequence,
         CASE WHEN days.day_sequence <= 5 THEN 'Diurno' ELSE NULL END AS shift_name,
         days.day_sequence > 5 AS is_rest_day
  FROM generate_series(1, 7) AS days(day_sequence)
  UNION ALL
  SELECT 'Semana A/B diurna y nocturna',
         days.day_sequence,
         CASE WHEN days.day_sequence BETWEEN 1 AND 5 THEN 'Diurno'
              WHEN days.day_sequence BETWEEN 8 AND 12 THEN 'Nocturno'
              ELSE NULL END,
         days.day_sequence IN (6, 7, 13, 14)
  FROM generate_series(1, 14) AS days(day_sequence)
) AS sequence
JOIN "shift_patterns" AS pattern ON pattern.name = sequence.pattern_name
LEFT JOIN "shifts" AS shift ON shift.name = sequence.shift_name
ON CONFLICT ("pattern_id", "day_sequence") DO NOTHING;
