import { createRoute } from "@hono/zod-openapi";
import { errorResponses, jsonContent } from "../schemas/common.js";
import { ActiveDisasterResponse } from "../schemas/disaster.js";
import * as disasterService from "../services/disaster-service.js";
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

export const disasterRoutes = createRouter().openapi(
  getActiveDisaster,
  async (c) =>
    c.json({ disaster: await disasterService.getActiveDisaster() }, 200),
);
