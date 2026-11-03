import { createRoute } from "@hono/zod-openapi";
import { notImplemented } from "../errors/app-error.js";
import { errorResponses, jsonContent } from "../schemas/common.js";
import { ActiveDisasterResponse } from "../schemas/disaster.js";
import { createRouter } from "./router.js";

const getActiveDisaster = createRoute({
  operationId: "getActiveDisaster",
  method: "get",
  path: "/disasters/active",
  tags: ["Disaster"],
  security: [],
  summary: "activeな災害",
  description: 'activeな災害がない場合は `{ "disaster": null }` を返す。',
  responses: {
    200: jsonContent(ActiveDisasterResponse, "activeな災害"),
    ...errorResponses(),
  },
});

export const disasterRoutes = createRouter().openapi(getActiveDisaster, () =>
  notImplemented(),
);
