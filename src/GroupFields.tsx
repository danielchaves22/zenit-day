import { useState } from "react";
import type { SubjectDoc } from "./model";
import { groupNames, nameKey } from "./groups";

export function GroupFields({
  doc,
  subjects,
  onChange,
  disabled,
}: {
  doc: SubjectDoc;
  subjects: SubjectDoc[];
  onChange: (group: string | null, subgroup: string | null) => void;
  disabled: boolean;
}) {
  const [newGroup, setNewGroup] = useState(false);
  const [newSubgroup, setNewSubgroup] = useState(false);
  const names = groupNames([
    ...subjects.map((s) => s.project),
    ...(newGroup ? [] : [doc.project]),
  ]);
  const children = groupNames([
    ...subjects
      .filter((s) => nameKey(s.project) === nameKey(doc.project))
      .map((s) => s.subgroup),
    ...(newSubgroup ? [] : [doc.subgroup]),
  ]);
  const groupValue =
    names.find((n) => nameKey(n) === nameKey(doc.project)) ?? "";
  const subgroupValue =
    children.find((n) => nameKey(n) === nameKey(doc.subgroup)) ?? "";
  return (
    <section className="group-fields" aria-label="Organização do assunto">
      <div className="form-grid">
        <label>
          Grupo <span className="optional">opcional</span>
          <select
            disabled={disabled}
            value={newGroup ? "new" : groupValue ? `name:${groupValue}` : ""}
            onChange={(e) => {
              setNewGroup(e.target.value === "new");
              setNewSubgroup(false);
              onChange(
                e.target.value.startsWith("name:")
                  ? e.target.value.slice(5)
                  : null,
                null,
              );
            }}
          >
            <option value="">Sem grupo</option>
            {names.map((name) => (
              <option key={name} value={`name:${name}`}>
                {name}
              </option>
            ))}
            <option value="new">Criar grupo…</option>
          </select>
        </label>
        <label>
          Subgrupo <span className="optional">opcional</span>
          <select
            disabled={disabled || !doc.project?.trim()}
            value={
              newSubgroup ? "new" : subgroupValue ? `name:${subgroupValue}` : ""
            }
            onChange={(e) => {
              setNewSubgroup(e.target.value === "new");
              onChange(
                doc.project,
                e.target.value.startsWith("name:")
                  ? e.target.value.slice(5)
                  : null,
              );
            }}
          >
            <option value="">Sem subgrupo</option>
            {children.map((name) => (
              <option key={name} value={`name:${name}`}>
                {name}
              </option>
            ))}
            <option value="new">Criar subgrupo…</option>
          </select>
        </label>
      </div>
      {newGroup && (
        <label>
          Nome do novo grupo
          <input
            autoFocus
            required
            maxLength={200}
            disabled={disabled}
            value={doc.project ?? ""}
            placeholder="Ex.: Trabalho"
            onChange={(e) =>
              onChange(e.target.value || null, doc.subgroup ?? null)
            }
          />
        </label>
      )}
      {newSubgroup && (
        <label>
          Nome do novo subgrupo
          <input
            autoFocus
            required
            maxLength={200}
            disabled={disabled}
            value={doc.subgroup ?? ""}
            placeholder="Ex.: Cliente A"
            onChange={(e) => onChange(doc.project, e.target.value || null)}
          />
        </label>
      )}
    </section>
  );
}
