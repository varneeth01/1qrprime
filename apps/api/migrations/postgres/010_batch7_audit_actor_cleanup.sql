-- Account deletion may anonymize the actor reference through the ON DELETE SET
-- NULL foreign key action. All other audit mutations remain prohibited.
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    (OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL) OR
    (OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS NULL)
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit immutable';
END;
$$ LANGUAGE plpgsql;

ALTER TABLE audit ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE audit DROP CONSTRAINT IF EXISTS audit_tenant_id_fkey;
ALTER TABLE audit ADD CONSTRAINT audit_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;

ALTER TABLE support_notes ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE support_notes DROP CONSTRAINT IF EXISTS support_notes_actor_id_fkey;
ALTER TABLE support_notes ADD CONSTRAINT support_notes_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
