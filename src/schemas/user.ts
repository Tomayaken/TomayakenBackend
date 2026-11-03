import { z } from "@hono/zod-openapi";
import { Name, Uuid } from "./common.js";

export const User = z
  .object({
    id: Uuid,
    name: Name,
    householdId: Uuid,
  })
  .openapi("User");

export const UserRef = User.pick({ id: true, name: true }).openapi("UserRef");

export const PutUserRequest = z
  .object({ name: Name })
  .openapi("PutUserRequest");

export const AddHouseholdMemberRequest = z
  .object({ name: Name })
  .openapi("AddHouseholdMemberRequest");

export const Household = z
  .object({
    id: Uuid,
    members: z.array(UserRef),
  })
  .openapi("Household");
