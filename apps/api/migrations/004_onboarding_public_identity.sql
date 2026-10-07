ALTER TABLE locations ADD COLUMN public_id TEXT;
ALTER TABLE locations ADD COLUMN status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE locations ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;
UPDATE locations SET public_id=lower(hex(randomblob(16))) WHERE public_id IS NULL;
UPDATE locations SET status=CASE WHEN published=1 THEN 'ACTIVE' ELSE 'DRAFT' END,
  onboarding_completed=CASE WHEN published=1 THEN 1 ELSE 0 END;
CREATE UNIQUE INDEX locations_public_id ON locations(public_id);
CREATE INDEX locations_status ON locations(status);
