import { createRoute } from "@hono/zod-openapi";
import {
  errorResponses,
  itemsOf,
  jsonBody,
  jsonContent,
} from "../../schemas/common.js";
import { CreateDisasterRequest, Disaster } from "../../schemas/disaster.js";
import { DisasterIdParam } from "../../schemas/params.js";
import * as disasterService from "../../services/disaster-service.js";
import { adminSecurity, createRouter } from "../router.js";

const listDisasters = createRoute({
  operationId: "listDisasters",
  method: "get",
  path: "/admin/disasters",
  tags: ["Admin"],
  summary: "災害一覧（過去分を含む、新しい順）",
  security: adminSecurity,
  responses: {
    200: jsonContent(itemsOf(Disaster).openapi("DisasterItems"), "災害一覧"),
    ...errorResponses("UNAUTHORIZED"),
  },
});

const createDisaster = createRoute({
  operationId: "createDisaster",
  method: "post",
  path: "/admin/disasters",
  tags: ["Admin"],
  summary: "災害を開始",
  security: adminSecurity,
  request: { body: jsonBody(CreateDisasterRequest) },
  responses: {
    201: jsonContent(Disaster, "開始した災害"),
    ...errorResponses(
      "INVALID_REQUEST",
      "UNAUTHORIZED",
      "DISASTER_ALREADY_ACTIVE",
    ),
  },
});

const closeDisaster = createRoute({
  operationId: "closeDisaster",
  method: "post",
  path: "/admin/disasters/{disasterId}/close",
  tags: ["Admin"],
  summary: "災害を終了",
  description: "滞在中のチェックインをすべてチェックアウトする。",
  security: adminSecurity,
  request: { params: DisasterIdParam },
  responses: {
    200: jsonContent(Disaster, "終了した災害"),
    ...errorResponses(
      "INVALID_REQUEST",
      "UNAUTHORIZED",
      "DISASTER_NOT_FOUND",
      "DISASTER_ALREADY_CLOSED",
    ),
  },
});

export const adminDisasterRoutes = createRouter()
  .openapi(listDisasters, async (c) =>
    c.json({ items: await disasterService.listDisasters() }, 200),
  )
  .openapi(createDisaster, async (c) => {
    const { name } = c.req.valid("json");
    return c.json(await disasterService.startDisaster(name), 201);
  })
  .openapi(closeDisaster, async (c) => {
    const { disasterId } = c.req.valid("param");
    return c.json(await disasterService.closeDisaster(disasterId), 200);
  });
