import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/email";
import { qrCodeDataUrl } from "@/lib/qr";
import { TemplatePicker } from "./TemplatePicker";
import { Card, PageHeader, PrintButton } from "@/components/ui";

type LabelTemplate = {
  id: string;
  name: string;
  sheet_width_in: number;
  sheet_height_in: number;
  label_width_in: number;
  label_height_in: number;
  margin_top_in: number;
  margin_left_in: number;
  gap_x_in: number;
  gap_y_in: number;
  columns: number;
  rows: number;
};

type LabelInstance = {
  catalogItemId: string;
  title: string;
  price: number;
  sku: string | null;
  isbn: string | null;
  qr: string;
};

export default async function FairLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ fairId: string }>;
  searchParams: Promise<{ template_id?: string }>;
}) {
  const { fairId } = await params;
  const { template_id: templateIdParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: fair }, { data: templates }, { data: allocations }] = await Promise.all([
    supabase.from("fairs").select("id, name, organizations(name)").eq("id", fairId).single(),
    supabase
      .from("label_templates")
      .select(
        "id, name, sheet_width_in, sheet_height_in, label_width_in, label_height_in, margin_top_in, margin_left_in, gap_x_in, gap_y_in, columns, rows",
      )
      .order("name"),
    supabase
      .from("allocations")
      .select("catalog_item_id, quantity_allocated, catalog_items(title, price, sku, isbn)")
      .eq("fair_id", fairId),
  ]);

  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const allTemplates = (templates ?? []) as LabelTemplate[];
  const selectedTemplate =
    allTemplates.find((t) => t.id === templateIdParam) ?? allTemplates[0];

  const allocatedRows = (allocations ?? []).filter((a) => a.quantity_allocated > 0);

  // One QR per distinct catalog item, not per label instance — the same
  // encoded string would otherwise be generated once per unit allocated,
  // which is wasted work for an identical result at fair-sized quantities.
  const qrByItem = new Map(
    await Promise.all(
      allocatedRows.map(async (row) => {
        const qr = await qrCodeDataUrl(`${siteUrl()}/admin/catalog/${row.catalog_item_id}/edit`);
        return [row.catalog_item_id, qr] as const;
      }),
    ),
  );

  const instances: LabelInstance[] = allocatedRows.flatMap((row) => {
    const item = row.catalog_items as unknown as {
      title: string;
      price: number;
      sku: string | null;
      isbn: string | null;
    } | null;
    if (!item) return [];
    const qr = qrByItem.get(row.catalog_item_id)!;
    return Array.from({ length: row.quantity_allocated }, () => ({
      catalogItemId: row.catalog_item_id,
      title: item.title,
      price: item.price,
      sku: item.sku,
      isbn: item.isbn,
      qr,
    }));
  });

  const orgName = (fair.organizations as unknown as { name: string } | null)?.name;

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          title={`${fair.name} — labels 🏷️`}
          description={`${orgName ?? ""} · one label per allocated unit, printed at packing time.`}
        />
      </div>

      {allTemplates.length === 0 ? (
        <p className="text-sm text-neutral-500 print:hidden">
          No label templates yet — create one at{" "}
          <a href="/admin/label-templates" className="text-accent-600 hover:underline">
            /admin/label-templates
          </a>{" "}
          first.
        </p>
      ) : allocatedRows.length === 0 ? (
        <p className="text-sm text-neutral-500 print:hidden">
          Nothing allocated to this fair yet — allocate stock first.
        </p>
      ) : (
        <>
          <Card className="max-w-sm print:hidden">
            <div className="flex flex-col gap-3">
              <TemplatePicker
                fairId={fairId}
                templates={allTemplates}
                selectedTemplateId={selectedTemplate.id}
              />
              <p className="text-sm text-neutral-600">
                {instances.length} label{instances.length === 1 ? "" : "s"} across{" "}
                {Math.ceil(instances.length / (selectedTemplate.columns * selectedTemplate.rows))}{" "}
                sheet(s) of {selectedTemplate.name}.
              </p>
              <PrintButton />
            </div>
          </Card>

          <LabelSheets template={selectedTemplate} instances={instances} />
        </>
      )}
    </div>
  );
}

function LabelSheets({
  template,
  instances,
}: {
  template: LabelTemplate;
  instances: LabelInstance[];
}) {
  const perSheet = template.columns * template.rows;
  const pages: LabelInstance[][] = [];
  for (let i = 0; i < instances.length; i += perSheet) {
    pages.push(instances.slice(i, i + perSheet));
  }

  return (
    <div className="hidden print:block">
      <style>{`
        @page { size: ${template.sheet_width_in}in ${template.sheet_height_in}in; margin: 0; }
        .label-page {
          display: grid;
          grid-template-columns: repeat(${template.columns}, ${template.label_width_in}in);
          grid-template-rows: repeat(${template.rows}, ${template.label_height_in}in);
          column-gap: ${template.gap_x_in}in;
          row-gap: ${template.gap_y_in}in;
          padding-top: ${template.margin_top_in}in;
          padding-left: ${template.margin_left_in}in;
          page-break-after: always;
        }
        .label-page:last-child { page-break-after: auto; }
      `}</style>
      {pages.map((page, i) => (
        <div key={i} className="label-page">
          {page.map((label, j) => (
            <div
              key={`${label.catalogItemId}-${j}`}
              className="flex items-center gap-1 overflow-hidden p-1"
              style={{ width: `${template.label_width_in}in`, height: `${template.label_height_in}in` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={label.qr} alt="" className="h-full w-auto flex-none object-contain" />
              <div className="min-w-0 flex-1 text-[7pt] leading-tight">
                <p className="line-clamp-2 font-semibold">{label.title}</p>
                <p>${label.price.toFixed(2)}</p>
                {(label.sku || label.isbn) && <p>{label.sku ?? label.isbn}</p>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
