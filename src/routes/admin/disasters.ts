import { createRoute } from "@hono/zod-openapi";
import { notImplemented } from "../../errors/app-error.js";
import {
  errorResponses,
  itemsOf,
  jsonBody,
  jsonContent,
} from "../../schemas/common.js";
import { CreateDisasterRequest, Disaster } from "../../schemas/disaster.js";
import { DisasterIdParam } from "../../schemas/params.js";
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
    ...errorResponses("INVALID_REQUEST", "UNAUTHORIZED", "DISASTER_ALREADY_ACTIVE"),
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
  .openapi(listDisasters, () => notImplemented())
  .openapi(createDisaster, () => notImplemented())
  .openapi(closeDisaster, () => notImplemented());
