import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { DOCS_PATH } from "./openapi.js";

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
  console.log(`API docs:    http://localhost:${info.port}${DOCS_PATH}`);
});
