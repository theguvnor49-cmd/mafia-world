-- 014_admin.sql
-- Phase 13: Admin tools. See GAME_DESIGN.md section 34 (Admin tools).
--
-- Design notes:
--   * `is_admin` is a plain boolean, not a roles table — this game has
--     exactly one privileged tier (operator/support), the same "simplest
--     reading the brief actually supports" call made for gangs (only the
--     Boss administers) and businesses (one owner, no shared control).
--     The brief never specifies admin tooling beyond one passing mention
--     ("[premium points are] granted/admin-controlled" — section 15/27),
--     so nothing more elaborate was invented.
--   * There is deliberately NO "promote to admin" endpoint anywhere in
--     this codebase. The first (and every later) admin is granted by
--     whoever controls the database running this SQL directly:
--       UPDATE users SET is_admin = true WHERE username = 'yourname';
--     A self-service promotion path would need its own bootstrap rule
--     ("who's allowed to grant the *first* admin?") that the brief gives
--     no basis for answering, and would turn this column into a
--     privilege-escalation surface. Documented in README.md.
--   * `admin_actions` logs every admin write (brief section 28's
--     "security principles" — financial operations should be
--     traceable), same "one table, an action_type enum column" shape as
--     `business_events`/`hospital_activities`, since every admin action
--     here shares the same columns (who did it, to whom, what, when).
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE admin_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID NOT NULL REFERENCES users(id),
  target_user_id  UUID NOT NULL REFERENCES users(id),
  action_type     TEXT NOT NULL CHECK (action_type IN (
                    'grant_cash', 'grant_premium_points', 'clear_status'
                  )),
  -- Signed delta for the two grant types (negative = a correcting
  -- deduction, not just a top-up); NULL for clear_status, which has no
  -- numeric amount.
  amount          BIGINT,
  detail          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_actions_target_created ON admin_actions (target_user_id, created_at);
CREATE INDEX idx_admin_actions_admin_created ON admin_actions (admin_id, created_at);
