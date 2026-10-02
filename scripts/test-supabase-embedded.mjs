import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
try {
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    alter default privileges in schema public grant all on tables to anon,authenticated;`);
  await db.exec(
    await read("../supabase/migrations/202609250001_zenit_day.sql"),
  );
  await db.exec(await read("../tests/supabase.integration.sql"));
  const migration = await read(
    "../supabase/migrations/202609280001_daily_goals.sql",
  );
  await db.exec(migration);
  await db.exec(migration);
  const results = await db.exec(
    await read("../tests/daily-goals.integration.sql"),
  );
  for (const result of results)
    for (const row of result.rows ?? []) console.log(row);
  const checklistMigration = await read(
    "../supabase/migrations/20260929040145_subject_checklists.sql",
  );
  await db.exec(checklistMigration);
  await db.exec(checklistMigration);
  const checklistResults = await db.exec(
    await read("../tests/checklists.integration.sql"),
  );
  for (const result of checklistResults)
    for (const row of result.rows ?? []) if (row.result) console.log(row);
  const groupMigration = await read(
    "../supabase/migrations/20260929043137_subject_groups.sql",
  );
  await db.exec(groupMigration);
  await db.exec(groupMigration);
  const groupResults = await db.exec(
    await read("../tests/groups.integration.sql"),
  );
  for (const result of groupResults)
    for (const row of result.rows ?? []) if (row.result) console.log(row);
  const hubMigration = await read(
    "../supabase/migrations/20260930171741_hub_oauth_read_only.sql",
  );
  await db.exec(hubMigration);
  await db.exec(hubMigration);
  const hubResults = await db.exec(
    await read("../tests/hub-readonly.integration.sql"),
  );
  for (const result of hubResults)
    for (const row of result.rows ?? []) if (row.result) console.log(row);
  console.log(
    "SQL validado em PostgreSQL embarcado (PGlite). Auth simulado; Supabase real não acessado.",
  );
  const priorityMigration = await read(
    "../supabase/migrations/20260930023730_subject_priorities.sql",
  );
  await db.exec(priorityMigration);
  await db.exec(priorityMigration);
  for (const file of [
    "priorities.integration.sql",
    "hub-readonly.integration.sql",
  ]) {
    const results = await db.exec(await read("../tests/" + file));
    for (const result of results)
      for (const row of result.rows ?? []) if (row.result) console.log(row);
  }
  await db.exec(
    await read("../supabase/migrations/20261002062738_recurring_reminders.sql"),
  );
  for (const result of await db.exec(
    await read("../tests/reminders.integration.sql"),
  ))
    for (const row of result.rows ?? []) if (row.result) console.log(row);
  await db.exec(
    await read(
      "../supabase/migrations/20261002111335_hub_reminder_consent.sql",
    ),
  );
  for (const file of [
    "hub-reminders.integration.sql",
    "hub-readonly.integration.sql",
    "reminders.integration.sql",
  ])
    for (const result of await db.exec(await read("../tests/" + file)))
      for (const row of result.rows ?? []) if (row.result) console.log(row);
} finally {
  await db.close();
}
