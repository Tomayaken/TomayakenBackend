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
      description:
        "currentOccupancy > capacity。満員でもチェックインは拒否しない",
      example: false,
    }),
    latitude: z.number().openapi({ example: 35.6812 }),
    longitude: z.number().openapi({ example: 139.7671 }),
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

export const NEARBY_DEFAULT_LIMIT = 5;
export const NEARBY_MAX_LIMIT = 20;

/**
 * クエリの数値。z.coerce.number() だけだと空文字（`?latitude=`）が 0 になるので、
 * 空文字は「指定なし」として扱う。
 */
const queryNumber = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

export const NearbyQuery = z.object({
  latitude: queryNumber(z.coerce.number().min(-90).max(90)).openapi({
    param: { name: "latitude", in: "query" },
    description: "端末の現在地の緯度",
    example: 35.6815,
  }),
  longitude: queryNumber(z.coerce.number().min(-180).max(180)).openapi({
    param: { name: "longitude", in: "query" },
    description: "端末の現在地の経度",
    example: 139.7665,
  }),
  limit: queryNumber(
    z.coerce
      .number()
      .int()
      .min(1)
      .max(NEARBY_MAX_LIMIT)
      .default(NEARBY_DEFAULT_LIMIT),
  ).openapi({
    param: { name: "limit", in: "query" },
    description: "返す避難所の最大件数",
    example: NEARBY_DEFAULT_LIMIT,
  }),
});

export const NearbyShelter = ShelterSummary.extend({
  latitude: Shelter.shape.latitude,
  longitude: Shelter.shape.longitude,
  distanceMeters: z.number().int().openapi({
    description: "現在地から避難所までの直線距離（m、四捨五入）",
    example: 72,
  }),
}).openapi("NearbyShelter");
