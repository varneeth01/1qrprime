-- Production hotfix: preserve historical records while allowing user deletion,
-- and normalize invalid legacy zero/equal menu discounts.
UPDATE items
SET discounted_price_paise=NULL
WHERE discounted_price_paise IS NOT NULL
  AND (discounted_price_paise <= 0 OR discounted_price_paise >= price_paise);

ALTER TABLE staff_invitations ALTER COLUMN invited_by DROP NOT NULL;
ALTER TABLE staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_invited_by_fkey;
ALTER TABLE staff_invitations ADD CONSTRAINT staff_invitations_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payment_route_approvals ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE payment_route_approvals DROP CONSTRAINT IF EXISTS payment_route_approvals_requested_by_fkey;
ALTER TABLE payment_route_approvals ADD CONSTRAINT payment_route_approvals_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payment_route_approvals ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE payment_route_approvals DROP CONSTRAINT IF EXISTS payment_route_approvals_owner_user_id_fkey;
ALTER TABLE payment_route_approvals ADD CONSTRAINT payment_route_approvals_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE campaigns ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_created_by_fkey;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE promotions ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_created_by_fkey;
ALTER TABLE promotions ADD CONSTRAINT promotions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE challenges ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_created_by_fkey;
ALTER TABLE challenges ADD CONSTRAINT challenges_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE refunds ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_requested_by_fkey;
ALTER TABLE refunds ADD CONSTRAINT refunds_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_approved_by_fkey;
ALTER TABLE refunds ADD CONSTRAINT refunds_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
