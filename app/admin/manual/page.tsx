import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import packageJson from "@/package.json";
import { Card } from "@/components/ui";

export default async function ManualPage() {
  const manualPath = path.join(process.cwd(), "docs", "MANUAL.md");
  const changelogPath = path.join(process.cwd(), "docs", "CHANGELOG.md");

  const [manualSource, changelogSource] = await Promise.all([
    fs.readFile(manualPath, "utf-8"),
    fs.readFile(changelogPath, "utf-8"),
  ]);

  const manualHtml = await marked.parse(manualSource);
  const changelogHtml = await marked.parse(changelogSource);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-neutral-900">
          Manual &amp; version 📖
        </h1>
        <p className="text-sm text-neutral-600">
          EasyBookFair v{packageJson.version}
        </p>
      </div>

      <Card className="max-w-3xl">
        {/* eslint-disable-next-line react/no-danger -- our own repo's markdown, not user input */}
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: manualHtml }} />
      </Card>

      <Card className="max-w-3xl">
        <h2 className="font-heading text-lg font-bold text-neutral-900">Changelog</h2>
        {/* eslint-disable-next-line react/no-danger -- our own repo's markdown, not user input */}
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: changelogHtml }} />
      </Card>
    </div>
  );
}
