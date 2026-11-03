import { z } from "@hono/zod-openapi";
import { SUPPLY_TRANSACTION_TYPES } from "../db/schema.js";
import { DateTime, Uuid, itemsOf } from "./common.js";

export const SupplyRef = z
  .object({
    id: Uuid,
    name: z.string().openapi({ example: "水" }),
    unit: z.string().openapi({ example: "bottle" }),
  })
  .openapi("SupplyRef");

export const ShelterSupply = SupplyRef.extend({
  quantity: z.number().int().openapi({ example: 120 }),
}).openapi("ShelterSupply");

export const ShelterSupplyItems = itemsOf(ShelterSupply).openapi(
  "ShelterSupplyItems",
);

export const SupplyOperationRequest = z
  .object({
    quantity: z.number().int().positive().openapi({ example: 20 }),
    operatorName: z.string().trim().max(100).optional().openapi({
      description: "管理画面で入力された運営者名（自己申告）",
      example: "受付担当A",
    }),
    note: z.string().trim().max(500).optional().openapi({ example: "朝の配布" }),
  })
  .openapi("SupplyOperationRequest");

export const SupplyTransaction = z
  .object({
    id: Uuid,
    supply: SupplyRef,
    type: z.enum(SUPPLY_TRANSACTION_TYPES),
    quantity: z.number().int(),
    operatorName: z.string().nullable(),
    note: z.string().nullable(),
    disasterId: Uuid.nullable(),
    createdAt: DateTime,
  })
  .openapi("SupplyTransaction");

export const SupplyTransactionItems = itemsOf(SupplyTransaction).openapi(
  "SupplyTransactionItems",
);

export const SupplyTransactionQuery = z.object({
  disasterId: Uuid.optional().openapi({
    param: { name: "disasterId", in: "query" },
  }),
  supplyId: Uuid.optional().openapi({
    param: { name: "supplyId", in: "query" },
  }),
});
