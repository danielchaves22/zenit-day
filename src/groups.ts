import type { Subject, SubjectDoc } from "./model";

export const nameKey = (value: string | null | undefined) =>
  (value ?? "").trim().normalize("NFC").toLocaleLowerCase("pt-BR");
const byName = (a: string, b: string) =>
  a.localeCompare(b, "pt-BR") || a.localeCompare(b);
export function groupNames(values: (string | null | undefined)[]) {
  const names = new Map<string, string>();
  // Stable spelling across devices, regardless of remote pagination or list order.
  for (const name of values
    .map((v) => v?.trim() ?? "")
    .filter(Boolean)
    .sort(byName)) {
    if (!names.has(nameKey(name))) names.set(nameKey(name), name);
  }
  return [...names.values()].sort(byName);
}
export function groupPath(subject: SubjectDoc) {
  return [subject.project?.trim(), subject.subgroup?.trim()]
    .filter(Boolean)
    .join(" › ");
}
export function panelKey(
  view: string,
  group: string | null,
  subgroup?: string,
) {
  return JSON.stringify([
    view,
    group === null ? null : nameKey(group),
    subgroup ? nameKey(subgroup) : null,
  ]);
}
export interface SubjectGroup {
  name: string;
  total: number;
  direct: Subject[];
  subgroups: { name: string; subjects: Subject[] }[];
}
export function groupSubjects(visible: Subject[], all = visible) {
  const names = groupNames(all.map((s) => s.project));
  const groups: SubjectGroup[] = [];
  for (const name of names) {
    const members = visible.filter((s) => nameKey(s.project) === nameKey(name));
    if (!members.length) continue;
    const subgroupNames = groupNames(
      all
        .filter((s) => nameKey(s.project) === nameKey(name))
        .map((s) => s.subgroup),
    );
    groups.push({
      name,
      total: members.length,
      direct: members.filter((s) => !nameKey(s.subgroup)),
      subgroups: subgroupNames
        .map((subgroup) => ({
          name: subgroup,
          subjects: members.filter(
            (s) => nameKey(s.subgroup) === nameKey(subgroup),
          ),
        }))
        .filter((s) => s.subjects.length),
    });
  }
  return { ungrouped: visible.filter((s) => !nameKey(s.project)), groups };
}
export function readPanels(namespace: string): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`zenit-day:panels:${namespace}`) ?? "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key, open]) => key.startsWith("[") && typeof open === "boolean",
      ),
    );
  } catch {
    return {};
  }
}
export function writePanels(namespace: string, value: Record<string, boolean>) {
  try {
    localStorage.setItem(
      `zenit-day:panels:${namespace}`,
      JSON.stringify(value),
    );
  } catch {
    /* A view preference must never prevent saving subjects. */
  }
}
