import { priorities, type Priority } from "./model";

export function PriorityPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Priority;
  onChange: (value: Priority) => void;
  disabled?: boolean;
}) {
  return (
    <label className="priority-picker">
      <span>Prioridade</span>
      <select
        aria-label="Prioridade"
        value={value}
        onChange={(event) => onChange(event.target.value as Priority)}
        disabled={disabled}
      >
        {Object.entries(priorities).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
