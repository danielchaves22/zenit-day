import { describe, expect, it } from "vitest";
import {
  blankDoc,
  compareSubjects,
  documentOf,
  emptyWorkspace,
  enqueue,
  parseBackup,
  validateDoc,
  type Subject,
} from "./model";
import { groupNames, groupSubjects, panelKey, groupPath } from "./groups";
const user = "11111111-1111-4111-8111-111111111111";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function subject(
  title: string,
  group: string | null,
  subgroup: string | null,
  created_at = "2026-09-29T12:00:00Z",
): Subject {
  return {
    ...blankDoc(title),
    id: crypto.randomUUID(),
    project: group,
    subgroup,
    user_id: user,
    revision: 1,
    created_at,
    updated_at: created_at,
    completed_at: null,
  };
}
describe("two-level groups", () => {
  it("keeps every subject exactly once, with direct members, same-name subgroups under distinct parents and stable sorting", () => {
    const subjects = [
      subject("Livre", null, null),
      subject("Direto", "Trabalho", null),
      subject("Antigo", "Trabalho", "Cliente", "2026-09-28T00:00:00Z"),
      subject("Novo", "trabalho", "Cliente"),
      subject("Pessoal", "Pessoal", "Cliente"),
    ].sort(compareSubjects);
    const { ungrouped, groups } = groupSubjects(subjects);
    expect(ungrouped.map((s) => s.title)).toEqual(["Livre"]);
    expect(groups.map((g) => g.name.toLowerCase())).toEqual([
      "pessoal",
      "trabalho",
    ]);
    expect(groups[1].total).toBe(3);
    expect(groups[1].direct.map((s) => s.title)).toEqual(["Direto"]);
    expect(groups[1].subgroups[0].subjects.map((s) => s.title)).toEqual([
      "Novo",
      "Antigo",
    ]);
    const all = [
      ...ungrouped,
      ...groups.flatMap((g) => [
        ...g.direct,
        ...g.subgroups.flatMap((s) => s.subjects),
      ]),
    ];
    expect(new Set(all.map((s) => s.id)).size).toBe(subjects.length);
    expect(all).toHaveLength(subjects.length);
  });
  it("counts only visible results and hides groups with no matches without changing their canonical names", () => {
    const all = [
      subject("A", "Trabalho", "Cliente A"),
      subject("B", "Pessoal", null),
      subject("C", "Trabalho", "Cliente B"),
    ];
    const groups = groupSubjects([all[0]], all).groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(1);
    expect(groups[0].subgroups.map((g) => g.name)).toEqual(["Cliente A"]);
  });
  it("keeps old request payloads and contexts intact and includes groups in backups", () => {
    const doc = blankDoc("Legado");
    delete doc.subgroup;
    doc.project = "Projeto A";
    const before = JSON.stringify(doc);
    expect(JSON.stringify(documentOf(doc))).toBe(before);
    const w = emptyWorkspace();
    enqueue(w, user, id, { ...doc, subgroup: "Etapa 1" });
    const restored = parseBackup(
      JSON.stringify({
        format: "zenit-day",
        version: 1,
        userId: user,
        project: "p",
        workspace: w,
      }),
      user,
      "p",
    );
    expect(groupPath(restored.workspace.subjects[id])).toBe(
      "Projeto A › Etapa 1",
    );
    expect(w.queue[0].doc.subgroup).toBe("Etapa 1");
  });
  it("rejects an orphan or invalid subgroup", () => {
    for (const subgroup of ["Cliente", 12, " ", "a".repeat(201)])
      expect(() =>
        validateDoc({ ...blankDoc("x"), subgroup } as never),
      ).toThrow();
    expect(() =>
      validateDoc({ ...blankDoc("x"), project: "P", subgroup: "S" }),
    ).not.toThrow();
  });
  it("uses collision-free panel keys for repeated names, delimiters and views", () => {
    expect(panelKey("today", "Trabalho", "Cliente")).not.toBe(
      panelKey("today", "Pessoal", "Cliente"),
    );
    expect(panelKey("all", "a/b", "c")).not.toBe(panelKey("all", "a", "b/c"));
    expect(panelKey("today", "P")).not.toBe(panelKey("all", "P"));
    expect(panelKey("today", null)).not.toBe(panelKey("today", "Sem grupo"));
    expect(panelKey("today", null)).not.toBe(panelKey("all", null));
    expect(groupNames([" Trabalho ", "trabalho", "", null])).toHaveLength(1);
  });
});
