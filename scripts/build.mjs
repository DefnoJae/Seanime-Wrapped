import ts from "typescript";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
await mkdir(join(root, "dist"), { recursive: true });
const files = ["src/domain.ts", "src/viewer.ts", "src/generated/audio.generated.ts", "src/index.ts"];
const parts = [];
for (const relative of files) {
  const source = await readFile(join(root, relative), "utf8");
  parts.push(source
    .replace(/^import[^;]+;\s*$/gm, "")
    .replace(/^export\s+/gm, ""));
}
const result = ts.transpileModule(parts.join("\n\n"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
    removeComments: false,
    newLine: ts.NewLineKind.LineFeed
  },
  reportDiagnostics: true
});
const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
if (errors.length) {
  for (const error of errors) console.error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  process.exitCode = 1;
} else {
  await writeFile(join(root, "dist", "code.js"), `// Seanime Wrapped v1.0.0 — generated bundle\n${result.outputText}`, "utf8");
}
console.log("Built dist/code.js");
