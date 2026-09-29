import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Locator,
} from "@playwright/test";
import type { Subject, Update } from "../../src/model";
import { blankDoc, today } from "../../src/model";
const uid = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
function mockService() {
  const rows = new Map<string, Subject>();
  const history: Update[] = [];
  const receipts = new Map<string, unknown>();
  let writes = 0;
  return {
    rows,
    get writes() {
      return writes;
    },
    async attach(context: BrowserContext, network: { online: boolean }) {
      await context.route("https://*.supabase.co/**", async (route) => {
        if (!network.online) {
          await route.abort("internetdisconnected");
          return;
        }
        const request = route.request();
        const url = new URL(request.url());
        let result: unknown = {};
        const data =
          request.method() === "POST" ? request.postDataJSON() : null;
        const user = request.headers().authorization?.includes(bob) ? bob : uid;
        if (url.pathname === "/auth/v1/token") {
          const id = data?.email === "bob@example.test" ? bob : uid;
          result = {
            access_token: id,
            refresh_token: "synthetic-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id,
              email: id === uid ? "alice@example.test" : "bob@example.test",
            },
          };
        } else if (url.pathname.endsWith("/zenit_day_connection_check"))
          result = {
            application: "zenit-day",
            schema_version: 1,
            authenticated: true,
            daily_goals: true,
            checklist: true,
            groups: true,
          };
        else if (url.pathname.endsWith("/zenit_day_save_subject")) {
          const key = user + "|" + data.p_subject_id;
          const receipt = user + "|" + data.p_operation_id;
          if (receipts.has(receipt)) result = receipts.get(receipt);
          else {
            const previous = rows.get(key);
            if ((previous?.revision ?? 0) !== data.p_expected_revision)
              result = { result: "conflict", subject: previous ?? null };
            else {
              const now = new Date().toISOString();
              const s = {
                ...data.p_subject,
                id: data.p_subject_id,
                user_id: user,
                revision: data.p_expected_revision + 1,
                created_at: previous?.created_at ?? now,
                updated_at: now,
                completed_at: data.p_subject.status === "done" ? now : null,
              };
              rows.set(key, s);
              history.push({
                id: data.p_operation_id,
                user_id: user,
                subject_id: s.id,
                subject_revision: s.revision,
                kind: !previous
                  ? "created"
                  : s.status === "done" && previous.status !== "done"
                    ? "completed"
                    : s.status !== "done" && previous.status === "done"
                      ? "reopened"
                      : "progress",
                note: data.p_note,
                created_at: now,
              });
              result = { result: "saved", subject: s };
              receipts.set(receipt, result);
              writes++;
            }
          }
        } else if (url.pathname.endsWith("/zenit_day_subjects"))
          result = [...rows.values()].filter((s) => s.user_id === user);
        else if (url.pathname.endsWith("/zenit_day_updates"))
          result = history.filter((h) => h.user_id === user);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(result),
        });
      });
    },
  };
}
async function login(page: Page, email = "alice@example.test") {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Entrar no meu espaço" }).click();
  await expect(
    page.getByRole("heading", { name: "Hoje", exact: true }),
  ).toBeVisible();
}

test("groups: long names remain usable on a narrow phone", async ({
  browser,
}) => {
  const backend = mockService();
  const phone = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  await backend.attach(phone, { online: true });
  const id = crypto.randomUUID();
  backend.rows.set(uid + "|" + id, {
    ...blankDoc("Conferir nomes extensos"),
    id,
    user_id: uid,
    revision: 1,
    created_at: "2026-09-29T10:00:00Z",
    updated_at: "2026-09-29T10:00:00Z",
    completed_at: null,
    project: "G".repeat(200),
    subgroup: "S".repeat(200),
  });
  const page = await phone.newPage();
  page.setDefaultTimeout(10000);
  await login(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".subject-open").tap();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Editar", exact: true }).tap();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  // Clearing the parent clears its child in the same edit.
  await page
    .getByRole("combobox", { name: "Grupo opcional", exact: true })
    .selectOption("");
  await expect(
    page.getByRole("combobox", { name: "Subgrupo opcional", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Salvar assunto" }).tap();
  await expect.poll(() => backend.writes).toBe(1);
  expect(backend.rows.get(uid + "|" + id)).toMatchObject({
    project: null,
    subgroup: null,
  });
  await page.getByRole("button", { name: "Voltar aos assuntos" }).tap();
  await expect(page.locator(".subject-group")).toHaveCount(1);
  await expect(
    page
      .getByRole("region", { name: "Sem grupo", exact: true })
      .locator(".subject-open"),
  ).toBeVisible();
  await phone.close();
});

test("groups: nesting, search, per-device panels, mobile return and offline moves", async ({
  browser,
}) => {
  const backend = mockService();
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const phone = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const dnet = { online: true },
    mnet = { online: true };
  await backend.attach(desktop, dnet);
  await backend.attach(phone, mnet);
  function seed(
    title: string,
    project: string | null,
    subgroup: string | null,
    created_at = "2026-09-28T12:00:00Z",
  ) {
    const id = crypto.randomUUID();
    backend.rows.set(uid + "|" + id, {
      ...blankDoc(title),
      id,
      user_id: uid,
      revision: 1,
      created_at,
      updated_at: created_at,
      completed_at: null,
      project,
      subgroup,
    });
  }
  seed("Assunto livre", null, null);
  seed("Direto antigo", "Trabalho", null, "2026-09-27T12:00:00Z");
  seed("Direto recente", "Trabalho", null);
  seed("Revisar contrato", "Trabalho", "Cliente A");
  seed("Retorno da Maria", "Trabalho", "Cliente B");
  seed("Organizar documentos", "Pessoal", "Cliente A");
  const page = await desktop.newPage(),
    mobile = await phone.newPage();
  page.setDefaultTimeout(10000);
  mobile.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  mobile.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  const work = page.getByRole("region", {
    name: "Grupo Trabalho",
    exact: true,
  });
  const workToggle = work.locator(":scope > .group-toggle");
  const customer = work.getByRole("region", {
    name: "Subgrupo Cliente A",
    exact: true,
  });
  const ungrouped = page.getByRole("region", {
    name: "Sem grupo",
    exact: true,
  });
  const ungroupedToggle = ungrouped.locator(":scope > .group-toggle");
  await expect(page.locator(".subject-list > section").first()).toHaveAttribute(
    "aria-label",
    "Sem grupo",
  );
  await expect(ungroupedToggle).toHaveAttribute("aria-expanded", "true");
  await expect(ungroupedToggle.locator(".group-count")).toHaveText("1");
  await ungroupedToggle.click();
  await expect(ungrouped.locator(".subject-open")).not.toBeVisible();
  await page
    .getByRole("textbox", { name: "Buscar assuntos" })
    .fill("Assunto livre");
  await expect(ungrouped.locator(".subject-open")).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await expect(ungroupedToggle).toHaveAttribute("aria-expanded", "false");
  expect(backend.writes).toBe(0);
  await expect(workToggle).toHaveAttribute("aria-expanded", "true");
  await expect(workToggle.locator(".group-count")).toHaveText("4");
  await expect(
    work.locator(":scope > .group-body > .subject-card .card-heading strong"),
  ).toHaveText(["Direto recente", "Direto antigo"]);
  await expect(customer.locator(".subject-card")).toHaveCount(1);
  await expect(
    page
      .getByRole("region", { name: "Sem grupo", exact: true })
      .locator(".subject-card"),
  ).toHaveCount(1);
  await workToggle.click();
  await expect(work.locator(".subject-open").first()).not.toBeVisible();
  await page.getByRole("textbox", { name: "Buscar assuntos" }).fill("contrato");
  await expect(customer.locator(".subject-open")).toBeVisible();
  await expect(workToggle.locator(".group-count")).toHaveText("1");
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await expect(workToggle).toHaveAttribute("aria-expanded", "false");
  await workToggle.click();
  await customer.locator(":scope > .group-toggle").click();
  await page.getByRole("button", { name: /^Acompanhamentos/ }).click();
  await expect(workToggle).toHaveAttribute("aria-expanded", "false");
  await expect(ungroupedToggle).toHaveAttribute("aria-expanded", "false");
  await ungroupedToggle.click();
  await workToggle.click();
  await login(page);
  await expect(ungroupedToggle).toHaveAttribute("aria-expanded", "false");
  await expect(workToggle).toHaveAttribute("aria-expanded", "true");
  await expect(customer.locator(":scope > .group-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  // New association opens both panels, including a previously collapsed group.
  await page.getByRole("button", { name: "Novo assunto", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Assunto", { exact: true }).fill("Preparar entrega");
  await form
    .getByRole("combobox", { name: "Grupo opcional", exact: true })
    .selectOption("name:Trabalho");
  await form
    .getByRole("combobox", { name: "Subgrupo opcional", exact: true })
    .selectOption("new");
  await form
    .getByLabel("Nome do novo subgrupo", { exact: true })
    .fill("Entrega");
  await form.getByRole("button", { name: "Salvar assunto" }).click();
  await expect.poll(() => backend.writes).toBe(1);
  const delivery = work.getByRole("region", {
    name: "Subgrupo Entrega",
    exact: true,
  });
  await expect(delivery.locator(":scope > .group-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(delivery.locator(".subject-open")).toBeVisible();
  await page.getByRole("button", { name: "Novo assunto", exact: true }).click();
  await form.getByLabel("Assunto", { exact: true }).fill("Estudar um tema");
  await expect(
    form.getByRole("combobox", { name: "Subgrupo opcional", exact: true }),
  ).toBeDisabled();
  await form
    .getByRole("combobox", { name: "Grupo opcional", exact: true })
    .selectOption("new");
  await form.getByLabel("Nome do novo grupo", { exact: true }).fill("Estudos");
  await form.getByRole("button", { name: "Salvar assunto" }).click();
  await expect.poll(() => backend.writes).toBe(2);
  await expect(
    page.getByRole("region", { name: "Grupo Estudos", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/groups-desktop.png",
    fullPage: true,
  });
  await login(mobile);
  const mobileUngrouped = mobile.getByRole("region", {
    name: "Sem grupo",
    exact: true,
  });
  const mobileUngroupedToggle = mobileUngrouped.locator(
    ":scope > .group-toggle",
  );
  await expect(mobileUngroupedToggle).toHaveAttribute("aria-expanded", "true");
  expect(
    (await mobileUngroupedToggle.boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);
  const mwork = mobile.getByRole("region", {
    name: "Grupo Trabalho",
    exact: true,
  });
  const mcustomer = mwork.getByRole("region", {
    name: "Subgrupo Cliente A",
    exact: true,
  });
  await expect(mcustomer.locator(":scope > .group-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const mdelivery = mwork.getByRole("region", {
    name: "Subgrupo Entrega",
    exact: true,
  });
  const card = mdelivery.locator(".subject-open");
  await card.scrollIntoViewIfNeeded();
  const returnY = await mobile.evaluate(() => window.scrollY);
  await card.tap();
  await expect(
    mobile.getByRole("heading", { name: "Preparar entrega", exact: true }),
  ).toBeVisible();
  await expect.poll(() => mobile.evaluate(() => window.scrollY)).toBe(0);
  await mobile.getByRole("button", { name: "Voltar aos assuntos" }).tap();
  await expect
    .poll(async () =>
      Math.abs((await mobile.evaluate(() => window.scrollY)) - returnY),
    )
    .toBeLessThan(3);
  await expect(mdelivery.locator(":scope > .group-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    (await mwork.locator(":scope > .group-toggle").boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // All nested cards preserve the same available width on a narrow phone.
  const topCard = mobile
    .getByRole("region", { name: "Sem grupo", exact: true })
    .locator(".subject-card");
  expect(
    Math.abs(
      (await topCard.boundingBox())!.width -
        (await mdelivery.locator(".subject-card").boundingBox())!.width,
    ),
  ).toBeLessThan(1);
  await mobile.screenshot({
    path: "test-results/groups-mobile.png",
    fullPage: true,
  });
  await card.tap();
  mnet.online = false;
  await mobile.getByRole("button", { name: "Editar", exact: true }).tap();
  const mform = mobile.getByRole("dialog");
  await mform
    .getByRole("combobox", { name: "Grupo opcional", exact: true })
    .selectOption("name:Pessoal");
  await expect(
    mform.getByRole("combobox", { name: "Subgrupo opcional", exact: true }),
  ).toHaveValue("");
  await mform
    .getByRole("combobox", { name: "Subgrupo opcional", exact: true })
    .selectOption("new");
  await mform
    .getByLabel("Nome do novo subgrupo", { exact: true })
    .fill("Rotina");
  await mform.screenshot({ path: "test-results/groups-editor-mobile.png" });
  await mform.getByRole("button", { name: "Salvar assunto" }).tap();
  await expect(mobile.locator(".detail-top")).toContainText("Pessoal › Rotina");
  await mobile.waitForTimeout(900);
  expect(backend.writes).toBe(2);
  // A concurrent desktop edit remains a conflict rather than losing the move.
  dnet.online = false;
  await delivery.locator(".subject-open").click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await form.getByLabel("Meu próximo passo").fill("Minha anotação offline");
  await form.getByRole("button", { name: "Salvar assunto" }).click();
  mnet.online = true;
  await login(mobile);
  await expect.poll(() => backend.writes).toBe(3);
  const mpersonal = mobile.getByRole("region", {
    name: "Grupo Pessoal",
    exact: true,
  });
  await expect(
    mpersonal
      .getByRole("region", { name: "Subgrupo Rotina", exact: true })
      .locator(".subject-open"),
  ).toBeVisible();
  dnet.online = true;
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(
    page.getByText("Este assunto mudou em dois lugares"),
  ).toBeVisible();
  await expect(page.locator(".conflict-versions")).toContainText(
    "Trabalho › Entrega",
  );
  await expect(page.locator(".conflict-versions")).toContainText(
    "Pessoal › Rotina",
  );
  await page.getByRole("button", { name: "Usar a outra versão" }).click();
  await expect(page.locator(".detail-top")).toContainText("Pessoal › Rotina");
  // A quick capture reveals its destination even if this panel was closed.
  await mobileUngroupedToggle.tap();
  await expect(mobileUngrouped.locator(".subject-open")).not.toBeVisible();
  await mobile.screenshot({
    path: "test-results/ungrouped-collapsed-mobile.png",
    fullPage: true,
  });
  await mobile
    .getByRole("textbox", { name: "Adicionar assunto para hoje" })
    .fill("Captura sem grupo");
  await mobile.getByRole("button", { name: "Adicionar", exact: true }).tap();
  await expect.poll(() => backend.writes).toBe(4);
  await mobile.getByRole("button", { name: "Voltar aos assuntos" }).tap();
  await expect(mobileUngroupedToggle).toHaveAttribute("aria-expanded", "true");
  await expect(mobileUngroupedToggle.locator(".group-count")).toHaveText("2");
  await expect(mobileUngrouped.locator(".subject-card").first()).toContainText(
    "Captura sem grupo",
  );
  await expect(mobileUngrouped.locator(".subject-open").first()).toBeVisible();
  await mobile.screenshot({
    path: "test-results/ungrouped-open-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await desktop.close();
  await phone.close();
});

test("checklist: newest first, editing, offline sync, mobile layout and conflicts", async ({
  browser,
}) => {
  async function setItem(control: Locator, done: boolean, touch = false) {
    expect(await control.isChecked()).toBe(!done);
    if (touch) await control.tap();
    else await control.click();
    if (done) await expect(control).toBeChecked();
    else await expect(control).not.toBeChecked();
  }
  const backend = mockService();
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const phone = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const dnet = { online: true },
    mnet = { online: true };
  await backend.attach(desktop, dnet);
  await backend.attach(phone, mnet);
  const oldId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9";
  backend.rows.set(uid + "|" + oldId, {
    ...blankDoc("Assunto antigo com meta"),
    id: oldId,
    user_id: uid,
    revision: 1,
    created_at: "2026-01-01T10:00:00Z",
    updated_at: new Date().toISOString(),
    completed_at: null,
    daily_goal: "finish",
    daily_goal_on: today(),
    review_on: "2026-01-01",
  });
  const page = await desktop.newPage(),
    mobile = await phone.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  mobile.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.getByRole("button", { name: "Novo assunto", exact: true }).click();
  const form = page.getByRole("dialog");
  const title = "Preparar reunião de acompanhamento";
  await form.getByLabel("Assunto", { exact: true }).fill(title);
  await form
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("doing");
  await form
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  await form
    .getByLabel("Item 1 do checklist", { exact: true })
    .fill("Revisar os pontos pendentes");
  await form
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  await form
    .getByLabel("Item 2 do checklist", { exact: true })
    .fill("Enviar pauta");
  await form.getByRole("button", { name: "Salvar assunto" }).click();
  await expect.poll(() => backend.writes).toBe(1);
  await expect(page.locator(".subject-card").first()).toContainText(title);
  const card = page.locator(".subject-card").filter({ hasText: title });
  const detail = page.getByRole("region", { name: "Checklist do assunto" });
  await detail
    .getByRole("checkbox", { name: "Revisar os pontos pendentes" })
    .check();
  await expect.poll(() => backend.writes).toBe(2);
  await setItem(
    detail.getByRole("checkbox", { name: "Enviar pauta" }),
    true,
    false,
  );
  await expect.poll(() => backend.writes).toBe(3);
  await expect(card.locator(".checklist-progress")).toHaveText("2 de 2 itens");
  await expect(card.locator(".status")).toHaveText("Em andamento");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await form
    .getByLabel("Item 1 do checklist", { exact: true })
    .fill("Revisar proposta");
  await form
    .getByRole("button", { name: "Remover item 2", exact: true })
    .click();
  await form
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  await form
    .getByLabel("Item 2 do checklist", { exact: true })
    .fill(
      "Compartilhar a pauta com todas as pessoas responsáveis pela execução",
    );
  await form.getByRole("button", { name: "Salvar assunto" }).click();
  await expect.poll(() => backend.writes).toBe(4);
  await expect(card.locator(".checklist-progress")).toHaveText("1 de 2 itens");
  await expect(page.locator(".subject-card").first()).toContainText(title);
  await page.screenshot({
    path: "test-results/checklist-desktop.png",
    fullPage: true,
  });
  await login(mobile);
  await mobile
    .locator(".subject-card")
    .filter({ hasText: title })
    .locator(".subject-open")
    .tap();
  const mdetail = mobile.getByRole("region", { name: "Checklist do assunto" });
  await expect(mdetail.getByRole("checkbox").first()).toBeChecked();
  expect(
    (await mdetail.locator("label").first().boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mobile.screenshot({
    path: "test-results/checklist-mobile.png",
    fullPage: true,
  });
  await mobile.getByRole("button", { name: "Editar", exact: true }).tap();
  await mobile
    .getByRole("dialog")
    .getByLabel("Item 2 do checklist", { exact: true })
    .scrollIntoViewIfNeeded();
  await mobile.screenshot({
    path: "test-results/checklist-editor-mobile.png",
    fullPage: true,
  });
  expect(
    await mobile
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await mobile
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .tap();
  mnet.online = false;
  await setItem(mdetail.getByRole("checkbox").first(), false, true);
  await setItem(mdetail.getByRole("checkbox").nth(1), true, true);
  await mobile.waitForTimeout(1000);
  expect(backend.writes).toBe(4);
  mnet.online = true;
  await login(mobile);
  await expect.poll(() => backend.writes).toBe(6);
  await mobile
    .locator(".subject-card")
    .filter({ hasText: title })
    .locator(".subject-open")
    .tap();
  await expect(mdetail.getByRole("checkbox").first()).not.toBeChecked();
  await expect(mdetail.getByRole("checkbox").nth(1)).toBeChecked();
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(detail.getByRole("checkbox").nth(1)).toBeChecked();
  // An open form must not overwrite a newer checklist received from another device.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await form
    .getByLabel("Assunto", { exact: true })
    .fill("Meu rascunho preservado");
  await setItem(mdetail.getByRole("checkbox").first(), true, true);
  await expect.poll(() => backend.writes).toBe(7);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(detail.getByRole("checkbox").first()).toBeChecked();
  await form.getByRole("button", { name: "Salvar assunto" }).click();
  await expect(form.getByRole("alert")).toContainText("mudou enquanto");
  await expect(form.getByLabel("Assunto", { exact: true })).toHaveValue(
    "Meu rascunho preservado",
  );
  await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  // Concurrent offline changes are compared, never silently overwritten.
  dnet.online = false;
  await setItem(detail.getByRole("checkbox").first(), false, false);
  await setItem(mdetail.getByRole("checkbox").nth(1), false, true);
  await expect.poll(() => backend.writes).toBe(8);
  dnet.online = true;
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(
    page.getByText("Este assunto mudou em dois lugares"),
  ).toBeVisible();
  await expect(page.locator(".conflict-checklist")).toHaveCount(2);
  await expect(page.locator(".conflict-checklist").first()).toContainText(
    "○ Revisar proposta",
  );
  await expect(page.locator(".conflict-checklist").nth(1)).toContainText(
    "✓ Revisar proposta",
  );
  await page.getByRole("button", { name: "Usar minha versão" }).click();
  await expect.poll(() => backend.writes).toBe(9);
  const saved = [...backend.rows.values()].find((s) => s.title === title)!;
  expect(saved.checklist?.map((item) => item.done)).toEqual([false, true]);
  expect(saved.status).toBe("doing");
  await expect(page.locator(".subject-card").first()).toContainText(title);
  expect(errors).toEqual([]);
  await desktop.close();
  await phone.close();
});
test("desktop and mobile: offline persistence, synchronization, conflicts, backup and account separation", async ({
  browser,
}) => {
  const backend = mockService();
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const dnet = { online: true },
    mnet = { online: true };
  await backend.attach(desktop, dnet);
  await backend.attach(phone, mnet);
  const page = await desktop.newPage(),
    mobile = await phone.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  mobile.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.getByRole("button", { name: "Novo assunto", exact: true }).click();
  const form = page.getByRole("dialog");
  await form
    .getByLabel("Assunto", { exact: true })
    .fill("Validar entrega com Maria");
  await form.getByLabel("Responsável pela execução").selectOption("other");
  await form.getByLabel("Nome do responsável").fill("Maria");
  await form.getByLabel("Prazo final").fill("2026-12-20");
  await form
    .getByLabel("Meu próximo passo")
    .fill("Conferir o resultado com Maria");
  await form.getByRole("button", { name: "Salvar assunto" }).click();
  await expect.poll(() => backend.writes).toBe(1);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  dnet.online = false;
  await login(mobile);
  await mobile
    .getByRole("button", { name: /^Validar entrega com Maria/ })
    .click();
  await expect(
    mobile.getByRole("heading", { name: "Validar entrega com Maria" }),
  ).toBeVisible();
  await mobile.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  mnet.online = false;
  await mobile.getByRole("button", { name: "Registrar andamento" }).click();
  await mobile
    .getByLabel("O que aconteceu?")
    .fill("Maria confirmou a entrega.");
  await mobile
    .getByRole("dialog")
    .getByRole("button", { name: "Registrar andamento" })
    .click();
  await expect(
    mobile.getByText("Maria confirmou a entrega.").first(),
  ).toBeVisible();
  await mobile.waitForTimeout(1100);
  expect(backend.writes).toBe(1);
  // Reload offline workspace after authenticating again (web preview never persists tokens).
  mnet.online = true;
  await login(mobile);
  await expect.poll(() => backend.writes).toBe(2);
  await mobile
    .getByRole("button", { name: /^Validar entrega com Maria/ })
    .click();
  await expect(
    mobile.getByText("Maria confirmou a entrega.").first(),
  ).toBeVisible();
  // Desktop still has revision one; its queued edit must become an explicit conflict.
  await page.getByRole("button", { name: "Registrar andamento" }).click();
  await page
    .getByLabel("O que aconteceu?")
    .fill("Minha atualização no computador.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Registrar andamento" })
    .click();
  dnet.online = true;
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(
    page.getByText("Este assunto mudou em dois lugares"),
  ).toBeVisible();
  expect(backend.writes).toBe(2);
  await page.getByRole("button", { name: "Usar minha versão" }).click();
  await expect.poll(() => backend.writes).toBe(3);
  expect([...backend.rows.values()][0].due_on).toBe("2026-12-20");
  expect([...backend.rows.values()][0].status).toBe("todo");
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar cópia" }).click();
  const download = await downloadPromise;
  await download.saveAs("test-results/backup.json");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Restaurar assuntos" }).click();
  await (await chooserPromise).setFiles("test-results/backup.json");
  await page
    .getByRole("button", { name: "Restaurar cópias", exact: true })
    .click();
  // Restore switches to Acompanhamentos, where panels start collapsed.
  await page
    .getByRole("region", { name: "Sem grupo", exact: true })
    .locator(":scope > .group-toggle")
    .click();
  await expect(
    page.getByRole("button", { name: /^Validar entrega com Maria/ }),
  ).toHaveCount(2);
  await expect.poll(() => backend.writes).toBe(4);
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await login(page, "bob@example.test");
  await expect(
    page.getByRole("button", { name: /^Validar entrega com Maria/ }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  await desktop.close();
  await phone.close();
});

test("quick completion and undo keep the list in place and synchronize offline across devices", async ({
  browser,
}) => {
  const backend = mockService();
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const phone = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const dnet = { online: true },
    mnet = { online: true };
  await backend.attach(desktop, dnet);
  await backend.attach(phone, mnet);
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
  const day = today();
  const original: Subject = {
    ...blankDoc("Retorno da Maria"),
    id,
    user_id: uid,
    revision: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    status: "waiting",
    responsible_is_self: false,
    responsible_name: "Maria",
    due_on: day,
    daily_goal: "finish",
    daily_goal_on: day,
    next_action: "Conferir a proposta",
  };
  backend.rows.set(uid + "|" + id, original);
  const page = await desktop.newPage(),
    mobile = await phone.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  mobile.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  const card = page
    .locator(".subject-card")
    .filter({ hasText: original.title });
  const mobileCard = mobile
    .locator(".subject-card")
    .filter({ hasText: original.title });
  async function checkLayout(p: Page) {
    const actions = p.locator(".subject-card-actions").first();
    const label = (await actions.locator("label").boundingBox())!;
    const select = (await actions.getByRole("combobox").boundingBox())!;
    const button = (await actions
      .getByRole("button", { name: `Concluir ${original.title}`, exact: true })
      .boundingBox())!;
    const footer = (await actions.boundingBox())!;
    expect(select.x - label.x - label.width).toBeGreaterThanOrEqual(3);
    expect(select.x - label.x - label.width).toBeLessThanOrEqual(12);
    expect(Math.abs(button.y - select.y)).toBeLessThan(3);
    expect(
      Math.abs(footer.x + footer.width - button.x - button.width),
    ).toBeLessThan(2);
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await checkLayout(page);
  await page.screenshot({
    path: "test-results/quick-completion-desktop.png",
    fullPage: true,
  });
  await card
    .getByRole("button", { name: `Concluir ${original.title}`, exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Hoje", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() => backend.rows.get(uid + "|" + id)?.status)
    .toBe("done");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(card.locator(".status")).toHaveText("Aguardando");
  await expect.poll(() => backend.writes).toBe(2);
  expect(backend.rows.get(uid + "|" + id)).toMatchObject({
    status: "waiting",
    due_on: day,
    review_on: original.review_on,
    daily_goal: "finish",
    next_action: "Conferir a proposta",
    completed_at: null,
  });
  await login(mobile);
  await checkLayout(mobile);
  expect(
    (await mobileCard
      .getByRole("button", { name: `Concluir ${original.title}`, exact: true })
      .boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);
  await mobile.screenshot({
    path: "test-results/quick-completion-mobile.png",
    fullPage: true,
  });
  mnet.online = false;
  await mobileCard
    .getByRole("button", { name: `Concluir ${original.title}`, exact: true })
    .tap();
  await expect(mobileCard).toHaveCount(0);
  await mobile.getByRole("button", { name: "Desfazer", exact: true }).tap();
  await expect(mobileCard.locator(".status")).toHaveText("Aguardando");
  await mobileCard
    .getByRole("button", { name: `Concluir ${original.title}`, exact: true })
    .tap();
  await expect(mobileCard).toHaveCount(0);
  expect(backend.writes).toBe(2);
  mnet.online = true;
  await login(mobile);
  await expect.poll(() => backend.writes).toBe(5);
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: /^Concluídos/ }).click();
  await page
    .getByRole("region", { name: "Sem grupo", exact: true })
    .locator(":scope > .group-toggle")
    .click();
  await expect(card.locator(".status")).toHaveText("Concluído");
  await expect(
    card.getByRole("button", {
      name: `Concluir ${original.title}`,
      exact: true,
    }),
  ).toHaveCount(0);
  await card.locator(".subject-open").click();
  await expect(
    page.locator(".history-item p").filter({ hasText: /^Assunto concluído\./ }),
  ).toHaveCount(3);
  expect(errors).toEqual([]);
  await desktop.close();
  await phone.close();
});

test("daily goals work from the list, sync offline, preserve deadlines and expire next day", async ({
  browser,
}) => {
  const backend = mockService();
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const dnet = { online: true },
    mnet = { online: true };
  await backend.attach(desktop, dnet);
  await backend.attach(phone, mnet);
  const day = today();
  const base = {
    user_id: uid,
    revision: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  };
  const dueId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const futureId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  backend.rows.set(uid + "|" + dueId, {
    ...blankDoc("Retorno da Maria"),
    ...base,
    id: dueId,
    responsible_is_self: false,
    responsible_name: "Maria",
    status: "waiting",
    review_on: day,
    due_on: day,
    next_action: "Conferir a proposta",
  });
  backend.rows.set(uid + "|" + futureId, {
    ...blankDoc("Revisar contrato"),
    ...base,
    id: futureId,
    review_on: "2099-12-30",
    due_on: "2099-12-31",
  });
  const page = await desktop.newPage(),
    mobile = await phone.newPage();
  await login(page);
  const dueCard = page
    .locator(".subject-card")
    .filter({ hasText: "Retorno da Maria" });
  await dueCard
    .getByRole("combobox", { name: "Meta de hoje para Retorno da Maria" })
    .selectOption("finish");
  await expect.poll(() => backend.writes).toBe(1);
  expect(backend.rows.get(uid + "|" + dueId)).toMatchObject({
    daily_goal: "finish",
    daily_goal_on: day,
    status: "waiting",
    due_on: day,
    next_action: "Conferir a proposta",
  });
  await login(mobile);
  const mobileCard = mobile
    .locator(".subject-card")
    .filter({ hasText: "Retorno da Maria" });
  await expect(mobileCard.getByRole("combobox")).toHaveValue("finish");
  mnet.online = false;
  await mobileCard.getByRole("combobox").selectOption("not_today");
  await expect(mobileCard).toHaveClass(/not-today/);
  await expect(mobileCard.getByText("Prazo hoje")).toBeVisible();
  await mobile.waitForTimeout(1000);
  expect(backend.writes).toBe(1);
  mnet.online = true;
  await login(mobile); // Reopens persisted offline queue.
  await expect.poll(() => backend.writes).toBe(2);
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(dueCard.getByRole("combobox")).toHaveValue("not_today");
  await page.getByRole("button", { name: /Acompanhamentos/ }).click();
  await page
    .getByRole("region", { name: "Sem grupo", exact: true })
    .locator(":scope > .group-toggle")
    .click();
  const futureCard = page
    .locator(".subject-card")
    .filter({ hasText: "Revisar contrato" });
  await futureCard.getByRole("combobox").selectOption("advance");
  await expect.poll(() => backend.writes).toBe(3);
  await page.getByRole("button", { name: /^Hoje/ }).click();
  await expect(futureCard).toBeVisible();
  await expect(page.locator(".subject-card").first()).toContainText(
    "Revisar contrato",
  );
  await page.screenshot({
    path: "test-results/daily-goals-desktop.png",
    fullPage: true,
  });
  await mobile.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(mobile.locator(".subject-card")).toHaveCount(2);
  await mobile.screenshot({
    path: "test-results/daily-goals-mobile.png",
    fullPage: true,
  });
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // At midnight, yesterday's intention no longer drives today's focus. Dates remain unchanged.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await page.clock.setFixedTime(tomorrow);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(futureCard).toHaveCount(0);
  await expect(dueCard).toBeVisible();
  await expect(dueCard.getByRole("combobox")).toHaveValue("");
  await expect(dueCard.locator(".deadline-note")).toBeVisible();
  expect(backend.rows.get(uid + "|" + dueId)?.daily_goal_on).toBe(day);
  expect(backend.rows.get(uid + "|" + futureId)?.review_on).toBe("2099-12-30");
  await desktop.close();
  await phone.close();
});
