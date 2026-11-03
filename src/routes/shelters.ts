import { createRoute } from "@hono/zod-openapi";
import { notImplemented } from "../errors/app-error.js";
import { errorResponses, itemsOf, jsonContent } from "../schemas/common.js";
import { ShelterIdParam } from "../schemas/params.js";
import { Shelter } from "../schemas/shelter.js";
import { createRouter } from "./router.js";

const listShelters = createRoute({
  operationId: "listShelters",
  method: "get",
  path: "/shelters",
  tags: ["Shelter"],
  security: [],
  summary: "避難所一覧",
  responses: {
    200: jsonContent(itemsOf(Shelter).openapi("ShelterItems"), "避難所一覧"),
    ...errorResponses(),
  },
});

const getShelter = createRoute({
  operationId: "getShelter",
  method: "get",
  path: "/shelters/{shelterId}",
  tags: ["Shelter"],
  security: [],
  summary: "避難所詳細",
  request: { params: ShelterIdParam },
  responses: {
    200: jsonContent(Shelter, "避難所"),
    ...errorResponses("INVALID_REQUEST", "SHELTER_NOT_FOUND"),
  },
});

export const shelterRoutes = createRouter()
  .openapi(listShelters, () => notImplemented())
  .openapi(getShelter, () => notImplemented());
