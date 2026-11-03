import { createRoute } from "@hono/zod-openapi";
import { notImplemented } from "../../errors/app-error.js";
import { errorResponses, jsonBody, jsonContent } from "../../schemas/common.js";
import { ShelterIdParam, ShelterSupplyParams } from "../../schemas/params.js";
import {
  ShelterSupply,
  SupplyOperationRequest,
  SupplyTransactionItems,
  SupplyTransactionQuery,
} from "../../schemas/supply.js";
import { adminSecurity, createRouter } from "../router.js";

const supplyIn = createRoute({
  operationId: "supplyIn",
  method: "post",
  path: "/admin/shelters/{shelterId}/supplies/{supplyId}/in",
  tags: ["Admin"],
  summary: "入庫",
  description:
    "在庫更新と履歴の記録を1トランザクションで行う。activeな災害があれば履歴に紐づける（なくても入庫できる）。",
  security: adminSecurity,
  request: {
    params: ShelterSupplyParams,
    body: jsonBody(SupplyOperationRequest),
  },
  responses: {
    200: jsonContent(ShelterSupply, "更新後の在庫"),
    ...errorResponses(
      "INVALID_REQUEST",
      "UNAUTHORIZED",
      "SHELTER_NOT_FOUND",
      "SUPPLY_NOT_FOUND",
    ),
  },
});

const supplyOut = createRoute({
  operationId: "supplyOut",
  method: "post",
  path: "/admin/shelters/{shelterId}/supplies/{supplyId}/out",
  tags: ["Admin"],
  summary: "配布",
  description:
    "在庫更新と履歴の記録を1トランザクションで行う。在庫より多い数量は INSUFFICIENT_SUPPLY。",
  security: adminSecurity,
  request: {
    params: ShelterSupplyParams,
    body: jsonBody(SupplyOperationRequest),
  },
  responses: {
    200: jsonContent(ShelterSupply, "更新後の在庫"),
    ...errorResponses(
      "INVALID_REQUEST",
      "UNAUTHORIZED",
      "SHELTER_NOT_FOUND",
      "SUPPLY_NOT_FOUND",
      "INSUFFICIENT_SUPPLY",
    ),
  },
});

const listTransactions = createRoute({
  operationId: "listTransactions",
  method: "get",
  path: "/admin/shelters/{shelterId}/supply-transactions",
  tags: ["Admin"],
  summary: "物資の入出庫履歴",
  security: adminSecurity,
  request: { params: ShelterIdParam, query: SupplyTransactionQuery },
  responses: {
    200: jsonContent(SupplyTransactionItems, "入出庫履歴（新しい順）"),
    ...errorResponses("INVALID_REQUEST", "UNAUTHORIZED", "SHELTER_NOT_FOUND"),
  },
});

export const adminSupplyRoutes = createRouter()
  .openapi(supplyIn, () => notImplemented())
  .openapi(supplyOut, () => notImplemented())
  .openapi(listTransactions, () => notImplemented());
