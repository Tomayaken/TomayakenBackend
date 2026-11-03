import { writeFileSync } from "node:fs";
import { app } from "../app.js";
import { openApiConfig } from "../openapi.js";

// サーバーを起動せずに OpenAPI を docs/openapi.json に書き出す。
// クライアントのコード生成やモックサーバーに使う。
const outFile = process.argv[2] ?? "docs/openapi.json";
const doc = app.getOpenAPIDocument(openApiConfig);
writeFileSync(outFile, `${JSON.stringify(doc, null, 2)}\n`);
console.log(
  `openapi: wrote ${outFile} (${Object.keys(doc.paths ?? {}).length} paths)`,
);
