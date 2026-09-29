import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const id = randomUUID();
const container = "zenit-day-db-check-" + id.slice(0, 8);
let started = false;
const docker = (args, input) => {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
  });
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.error?.message || "Docker command failed",
    );
  return result.stdout;
};
const sql = (text) =>
  docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    text,
  );
try {
  docker([
    "run",
    "--rm",
    "--detach",
    "--name",
    container,
    "--label",
    "zenit-day-test=" + id,
    "--network",
    "none",
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:14-alpine",
  ]);
  started = true;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      docker(["exec", container, "pg_isready", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!ready) throw new Error("Temporary PostgreSQL did not become ready.");
  sql(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    alter default privileges in schema public grant all on tables to anon,authenticated;`);
  sql(
    await readFile(
      new URL(
        "../supabase/migrations/202609250001_zenit_day.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  console.log(
    sql(
      await readFile(
        new URL("../tests/supabase.integration.sql", import.meta.url),
        "utf8",
      ),
    ).trim(),
  );
  const goalsMigration = await readFile(
    new URL(
      "../supabase/migrations/202609280001_daily_goals.sql",
      import.meta.url,
    ),
    "utf8",
  );
  sql(goalsMigration);
  sql(goalsMigration); // An interrupted setup can safely be repeated.
  console.log(
    sql(
      await readFile(
        new URL("../tests/daily-goals.integration.sql", import.meta.url),
        "utf8",
      ),
    ).trim(),
  );
  const checklistMigration = await readFile(
    new URL(
      "../supabase/migrations/20260929040145_subject_checklists.sql",
      import.meta.url,
    ),
    "utf8",
  );
  sql(checklistMigration);
  sql(checklistMigration);
  console.log(
    sql(
      await readFile(
        new URL("../tests/checklists.integration.sql", import.meta.url),
        "utf8",
      ),
    ).trim(),
  );
  const groupMigration = await readFile(
    new URL(
      "../supabase/migrations/20260929043137_subject_groups.sql",
      import.meta.url,
    ),
    "utf8",
  );
  sql(groupMigration);
  sql(groupMigration);
  console.log(
    sql(
      await readFile(
        new URL("../tests/groups.integration.sql", import.meta.url),
        "utf8",
      ),
    ).trim(),
  );
  const checks = sql(
    await readFile(
      new URL("../supabase/checks/verify-setup.sql", import.meta.url),
      "utf8",
    ),
  );
  if (/\|\s*f\s*$/m.test(checks)) throw new Error(checks);
  console.log(checks.trim());
  console.log(
    "Teste local concluído. Auth foi simulado; este teste não acessou um projeto Supabase real.",
  );
} finally {
  if (started) {
    const label = docker([
      "inspect",
      "--format",
      '{{index .Config.Labels "zenit-day-test"}}',
      container,
    ]).trim();
    if (label === id) docker(["stop", container]);
  }
}
