import { createRoute } from "@hono/zod-openapi";
import { errorResponses, itemsOf, jsonContent } from "../schemas/common.js";
import { ShelterIdParam } from "../schemas/params.js";
import { NearbyQuery, NearbyShelter, Shelter } from "../schemas/shelter.js";
import * as shelterService from "../services/shelter-service.js";
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

const listNearbyShelters = createRoute({
  operationId: "listNearbyShelters",
  method: "get",
  path: "/shelters/nearby",
  tags: ["Shelter"],
  security: [],
  summary: "現在地から近い避難所",
  description: [
    "アプリがGPSで得た現在地から、近い順に避難所を返す。このAPIはチェックインを行わない。",
    "- 距離は球面上の直線距離（ハーバーサイン公式）。道のりではない。",
    "- 距離の上限は設けない。どこまでを「近くにある」とみなすかはアプリが決める。",
  ].join("\n"),
  request: { query: NearbyQuery },
  responses: {
    200: jsonContent(
      itemsOf(NearbyShelter).openapi("NearbyShelterItems"),
      "近い順の避難所",
    ),
    ...errorResponses("INVALID_REQUEST"),
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
  .openapi(listShelters, async (c) => {
    const items = await shelterService.listShelters();
    return c.json({ items }, 200);
  })
  // /shelters/{shelterId} より先に登録する（"nearby" を ID として扱わせない）
  .openapi(listNearbyShelters, async (c) => {
    const { latitude, longitude, limit } = c.req.valid("query");
    const items = await shelterService.listNearbyShelters(
      { latitude, longitude },
      limit,
    );
    return c.json({ items }, 200);
  })
  .openapi(getShelter, async (c) => {
    const { shelterId } = c.req.valid("param");
    return c.json(await shelterService.getShelter(shelterId), 200);
  });
