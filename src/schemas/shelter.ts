import { z } from "@hono/zod-openapi";
import { Uuid } from "./common.js";

export const Shelter = z
  .object({
    id: Uuid,
    name: z.string().openapi({ example: "第一小学校" }),
    address: z.string().nullable().openapi({ example: "○○市中央1-1-1" }),
    capacity: z.number().int().openapi({ example: 500 }),
    currentOccupancy: z.number().int().openapi({
      description: "滞在中（チェックアウトしていない）のチェックイン数",
      example: 132,
    }),
    isOverCapacity: z.boolean().openapi({
      description: "currentOccupancy > capacity。満員でもチェックインは拒否しない",
      example: false,
    }),
    latitude: z.number().nullable().openapi({ example: 35.6812 }),
    longitude: z.number().nullable().openapi({ example: 139.7671 }),
  })
  .openapi("Shelter");

export const ShelterSummary = Shelter.pick({
  id: true,
  name: true,
  capacity: true,
  currentOccupancy: true,
  isOverCapacity: true,
}).openapi("ShelterSummary");

export const ShelterRef = Shelter.pick({ id: true, name: true }).openapi(
  "ShelterRef",
);

export const BeaconQuery = z.object({
  major: z.coerce
    .number()
    .int()
    .min(0)
    .max(65535)
    .openapi({ param: { name: "major", in: "query" }, example: 1 }),
  minor: z.coerce
    .number()
    .int()
    .min(0)
    .max(65535)
    .openapi({ param: { name: "minor", in: "query" }, example: 1 }),
});
