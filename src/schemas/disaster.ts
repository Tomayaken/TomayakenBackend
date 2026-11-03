import { z } from "@hono/zod-openapi";
import { DISASTER_STATUSES } from "../db/schema.js";
import { DateTime, Uuid } from "./common.js";

export const Disaster = z
  .object({
    id: Uuid,
    name: z.string().openapi({ example: "2026年11月 ○○地震" }),
    status: z.enum(DISASTER_STATUSES),
    startedAt: DateTime,
    endedAt: DateTime.nullable(),
  })
  .openapi("Disaster");

export const ActiveDisasterResponse = z
  .object({ disaster: Disaster.nullable() })
  .openapi("ActiveDisasterResponse");

export const CreateDisasterRequest = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .openapi({ example: "2026年11月 ○○地震" }),
  })
  .openapi("CreateDisasterRequest");
