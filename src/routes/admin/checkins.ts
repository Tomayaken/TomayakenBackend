import { createRoute } from "@hono/zod-openapi";
import { notImplemented } from "../../errors/app-error.js";
import {
  AdminCheckinItems,
  AdminCheckinQuery,
  Checkin,
  ProxyCheckinRequest,
  ProxyCheckinResponse,
} from "../../schemas/checkin.js";
import { errorResponses, jsonBody, jsonContent } from "../../schemas/common.js";
import { CheckinIdParam, ShelterIdParam } from "../../schemas/params.js";
import * as checkinService from "../../services/checkin-service.js";
import { adminSecurity, createRouter } from "../router.js";

const listCheckins = createRoute({
  operationId: "listCheckins",
  method: "get",
  path: "/admin/shelters/{shelterId}/checkins",
  tags: ["Admin"],
  summary: "避難者一覧",
  security: adminSecurity,
  request: { params: ShelterIdParam, query: AdminCheckinQuery },
  responses: {
    200: jsonContent(AdminCheckinItems, "避難者一覧"),
    ...errorResponses("INVALID_REQUEST", "UNAUTHORIZED", "SHELTER_NOT_FOUND"),
  },
});

const proxyCheckin = createRoute({
  operationId: "proxyCheckin",
  method: "post",
  path: "/admin/shelters/{shelterId}/checkins",
  tags: ["Admin"],
  summary: "代理チェックイン（優先度低）",
  description:
    "スマホを持たない人を運営者が代理でチェックインする。ユーザー（と単独の世帯）を同時に作成する。",
  security: adminSecurity,
  request: { params: ShelterIdParam, body: jsonBody(ProxyCheckinRequest) },
  responses: {
    201: jsonContent(ProxyCheckinResponse, "作成したユーザーとチェックイン"),
    ...errorResponses(
      "INVALID_REQUEST",
      "UNAUTHORIZED",
      "SHELTER_NOT_FOUND",
      "NO_ACTIVE_DISASTER",
    ),
  },
});

const proxyCheckout = createRoute({
  operationId: "proxyCheckout",
  method: "post",
  path: "/admin/checkins/{checkinId}/checkout",
  tags: ["Admin"],
  summary: "代理チェックアウト",
  description: "世帯の制約なしにチェックアウトする。",
  security: adminSecurity,
  request: { params: CheckinIdParam },
  responses: {
    200: jsonContent(Checkin, "更新後のチェックイン"),
    ...errorResponses(
      "INVALID_REQUEST",
      "UNAUTHORIZED",
      "CHECKIN_NOT_FOUND",
      "NOT_CHECKED_IN",
    ),
  },
});

export const adminCheckinRoutes = createRouter()
  .openapi(listCheckins, async (c) => {
    const { shelterId } = c.req.valid("param");
    const { status } = c.req.valid("query");
    const items = await checkinService.listShelterCheckins(shelterId, {
      activeOnly: status === "active",
    });
    return c.json({ items }, 200);
  })
  .openapi(proxyCheckin, () => notImplemented())
  .openapi(proxyCheckout, async (c) => {
    const { checkinId } = c.req.valid("param");
    return c.json(await checkinService.proxyCheckout(checkinId), 200);
  });
