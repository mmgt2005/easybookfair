"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";

type FieldKey =
  | "name"
  | "sheet_width_in"
  | "sheet_height_in"
  | "label_width_in"
  | "label_height_in"
  | "margin_top_in"
  | "margin_left_in"
  | "gap_x_in"
  | "gap_y_in"
  | "columns"
  | "rows";

// Kept as strings, not numbers, in state — a controlled numeric <input>
// that stores a parsed Number fights the user mid-edit (clearing a field
// or typing "1." collapses to 0 or drops the trailing dot). Parsing only
// happens where the preview actually needs a number.
type FormValues = Record<FieldKey, string>;

const DEFAULTS: FormValues = {
  name: "",
  sheet_width_in: "8.5",
  sheet_height_in: "11",
  label_width_in: "2",
  label_height_in: "1",
  margin_top_in: "0",
  margin_left_in: "0",
  gap_x_in: "0",
  gap_y_in: "0",
  columns: "3",
  rows: "10",
};

function num(s: string, fallback = 0) {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export function LabelTemplateFormFields({
  action,
  submitLabel,
  defaultValues,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  defaultValues?: Partial<Record<FieldKey, string | number>>;
}) {
  const [values, setValues] = useState<FormValues>(() => {
    const merged = { ...DEFAULTS };
    for (const key of Object.keys(merged) as FieldKey[]) {
      const v = defaultValues?.[key];
      if (v !== undefined) merged[key] = String(v);
    }
    return merged;
  });

  function onChange(key: FieldKey) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setValues((prev) => ({ ...prev, [key]: value }));
    };
  }

  return (
    <form action={action} className="flex flex-col gap-6 md:flex-row">
      <div className="flex flex-1 flex-col gap-3">
        <Input
          name="name"
          required
          placeholder="Name (e.g. Avery 5160)"
          value={values.name}
          onChange={onChange("name")}
        />
        <p className="text-xs font-semibold text-neutral-500">Sheet size (in)</p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            name="sheet_width_in"
            type="number"
            step="0.01"
            required
            placeholder="Width"
            value={values.sheet_width_in}
            onChange={onChange("sheet_width_in")}
          />
          <Input
            name="sheet_height_in"
            type="number"
            step="0.01"
            required
            placeholder="Height"
            value={values.sheet_height_in}
            onChange={onChange("sheet_height_in")}
          />
        </div>
        <p className="text-xs font-semibold text-neutral-500">Label size (in)</p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            name="label_width_in"
            type="number"
            step="0.01"
            required
            placeholder="Width"
            value={values.label_width_in}
            onChange={onChange("label_width_in")}
          />
          <Input
            name="label_height_in"
            type="number"
            step="0.01"
            required
            placeholder="Height"
            value={values.label_height_in}
            onChange={onChange("label_height_in")}
          />
        </div>
        <p className="text-xs font-semibold text-neutral-500">Margins (in, from top-left)</p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            name="margin_top_in"
            type="number"
            step="0.01"
            placeholder="Top"
            value={values.margin_top_in}
            onChange={onChange("margin_top_in")}
          />
          <Input
            name="margin_left_in"
            type="number"
            step="0.01"
            placeholder="Left"
            value={values.margin_left_in}
            onChange={onChange("margin_left_in")}
          />
        </div>
        <p className="text-xs font-semibold text-neutral-500">Gaps between labels (in)</p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            name="gap_x_in"
            type="number"
            step="0.01"
            placeholder="Horizontal"
            value={values.gap_x_in}
            onChange={onChange("gap_x_in")}
          />
          <Input
            name="gap_y_in"
            type="number"
            step="0.01"
            placeholder="Vertical"
            value={values.gap_y_in}
            onChange={onChange("gap_y_in")}
          />
        </div>
        <p className="text-xs font-semibold text-neutral-500">Grid</p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            name="columns"
            type="number"
            min={1}
            required
            placeholder="Columns"
            value={values.columns}
            onChange={onChange("columns")}
          />
          <Input
            name="rows"
            type="number"
            min={1}
            required
            placeholder="Rows"
            value={values.rows}
            onChange={onChange("rows")}
          />
        </div>
        <Button type="submit">{submitLabel}</Button>
      </div>

      <div className="flex flex-shrink-0 flex-col items-center gap-2 md:w-64">
        <p className="self-start text-xs font-semibold text-neutral-500">Preview</p>
        <LabelSheetPreview values={values} />
      </div>
    </form>
  );
}

const PREVIEW_MAX_WIDTH = 220;
const PREVIEW_MAX_HEIGHT = 280;

function LabelSheetPreview({ values }: { values: FormValues }) {
  const sheetW = Math.max(num(values.sheet_width_in), 0.1);
  const sheetH = Math.max(num(values.sheet_height_in), 0.1);
  const labelW = Math.max(num(values.label_width_in), 0.05);
  const labelH = Math.max(num(values.label_height_in), 0.05);
  const marginTop = Math.max(num(values.margin_top_in), 0);
  const marginLeft = Math.max(num(values.margin_left_in), 0);
  const gapX = Math.max(num(values.gap_x_in), 0);
  const gapY = Math.max(num(values.gap_y_in), 0);
  const columns = Math.max(Math.round(num(values.columns)), 0);
  const rows = Math.max(Math.round(num(values.rows)), 0);
  // Capped for the drawn grid only (not the real values) — a stray typo
  // like an extra digit in "columns" shouldn't render thousands of divs.
  const drawnColumns = Math.min(columns, 30);
  const drawnRows = Math.min(rows, 40);

  // Scale to fit within a fixed box, whichever axis is more constraining —
  // a tall narrow sheet (most letter-size label sheets) is limited by
  // height, a wide short one by width.
  const scale = Math.min(PREVIEW_MAX_WIDTH / sheetW, PREVIEW_MAX_HEIGHT / sheetH);

  const labels: { key: string; left: number; top: number; width: number; height: number }[] = [];
  for (let r = 0; r < drawnRows; r++) {
    for (let c = 0; c < drawnColumns; c++) {
      labels.push({
        key: `${r}-${c}`,
        left: (marginLeft + c * (labelW + gapX)) * scale,
        top: (marginTop + r * (labelH + gapY)) * scale,
        width: labelW * scale,
        height: labelH * scale,
      });
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative overflow-visible border-2 border-dashed border-neutral-300 bg-white shadow-sm"
        style={{ width: sheetW * scale, height: sheetH * scale }}
      >
        {labels.map((l) => (
          <div
            key={l.key}
            className="absolute rounded-sm border border-accent-400 bg-accent-50"
            style={{ left: l.left, top: l.top, width: l.width, height: l.height }}
          />
        ))}
      </div>
      <p className="text-center text-xs text-neutral-500">
        {columns} × {rows} = {columns * rows} label{columns * rows === 1 ? "" : "s"}/sheet
        <br />
        sheet {sheetW}&quot; × {sheetH}&quot;
        {(columns > drawnColumns || rows > drawnRows) && (
          <>
            <br />
            (preview capped)
          </>
        )}
      </p>
    </div>
  );
}
