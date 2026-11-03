import { createRoute, z } from "@hono/zod-openapi";
import { notImplemented } from "../errors/app-error.js";
import { errorResponses, jsonContent } from "../schemas/common.js";
import { BeaconQuery, ShelterSummary } from "../schemas/shelter.js";
import { createRouter } from "./router.js";

const getShelterByBeacon = createRoute({
  operationId: "getShelterByBeacon",
  method: "get",
  path: "/beacons/shelter",
  tags: ["Beacon"],
  security: [],
  summary: "Beaconから避難所を取得",
  description:
    "アプリが検出したiBeaconの major / minor から避難所を取得する。このAPIはチェックインを行わない。",
  request: { query: BeaconQuery },
  responses: {
    200: jsonContent(
      z.object({ shelter: ShelterSummary }).openapi("BeaconShelterResponse"),
      "Beaconが設置された避難所",
    ),
    ...errorResponses("INVALID_REQUEST", "BEACON_NOT_FOUND"),
  },
});

export const beaconRoutes = createRouter().openapi(getShelterByBeacon, () =>
  notImplemented(),
);
