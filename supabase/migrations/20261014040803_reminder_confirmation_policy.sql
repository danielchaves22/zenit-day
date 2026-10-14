-- Evaluate the request identity once per statement, not once per completion.
alter policy reminder_completions_owned_read on public.zenit_day_reminder_completions
using (
  (select auth.uid())=user_id and (
    (select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is null
    or (select zenit_day_private.reminders_allowed())
  )
);
