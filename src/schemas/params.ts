import { z } from "@hono/zod-openapi";
import { Uuid } from "./common.js";

const pathUuid = (name: string) =>
  Uuid.openapi({ param: { name, in: "path" } });

export const ShelterIdParam = z.object({ shelterId: pathUuid("shelterId") });
export const UserIdParam = z.object({ userId: pathUuid("userId") });
export const CheckinIdParam = z.object({ checkinId: pathUuid("checkinId") });
export const DisasterIdParam = z.object({ disasterId: pathUuid("disasterId") });
export const ShelterSupplyParams = z.object({
  shelterId: pathUuid("shelterId"),
  supplyId: pathUuid("supplyId"),
});
