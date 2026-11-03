import { createRoute } from "@hono/zod-openapi";
import { notImplemented } from "../errors/app-error.js";
import { errorResponses, jsonContent } from "../schemas/common.js";
import { ShelterIdParam } from "../schemas/params.js";
import { ShelterSupplyItems } from "../schemas/supply.js";
import { createRouter } from "./router.js";

const listShelterSupplies = createRoute({
  operationId: "listShelterSupplies",
  method: "get",
  path: "/shelters/{shelterId}/supplies",
  tags: ["Supply"],
  security: [],
  summary: "物資の在庫一覧",
  description: "全物資マスタを返し、在庫行がないものは quantity: 0 とする。",
  request: { params: ShelterIdParam },
  responses: {
    200: jsonContent(ShelterSupplyItems, "在庫一覧"),
    ...errorResponses("INVALID_REQUEST", "SHELTER_NOT_FOUND"),
  },
});

export const supplyRoutes = createRouter().openapi(listShelterSupplies, () =>
  notImplemented(),
);
