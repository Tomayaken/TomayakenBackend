import { z } from "@hono/zod-openapi";
import { DateTime, Name, Uuid, itemsOf } from "./common.js";
import { ShelterRef } from "./shelter.js";
import { User, UserRef } from "./user.js";

export const Checkin = z
  .object({
    id: Uuid,
    userId: Uuid,
    shelterId: Uuid,
    disasterId: Uuid,
    checkedInAt: DateTime,
    checkedOutAt: DateTime.nullable(),
  })
  .openapi("Checkin");

export const CheckinRequest = z
  .object({
    userIds: z.array(Uuid).min(1).optional().openapi({
      description:
        "チェックインする利用者。自分と同じ世帯のメンバーのみ指定できる。省略時は自分（X-User-Id）のみ",
    }),
  })
  .openapi("CheckinRequest");

export const CheckinItems = itemsOf(Checkin).openapi("CheckinItems");

// ALREADY_CHECKED_IN の details（説明用。ErrorResponse.details に入る）
export const CheckinConflict = z
  .object({
    userId: Uuid,
    checkinId: Uuid,
    shelter: ShelterRef,
  })
  .openapi("CheckinConflict");

export const MyCheckinsResponse = itemsOf(
  z.object({
    user: UserRef,
    checkin: z
      .object({
        id: Uuid,
        shelter: ShelterRef,
        checkedInAt: DateTime,
      })
      .nullable(),
  }),
).openapi("MyCheckinsResponse");

export const AdminCheckin = z
  .object({
    id: Uuid,
    user: User,
    checkedInAt: DateTime,
    checkedOutAt: DateTime.nullable(),
  })
  .openapi("AdminCheckin");

export const AdminCheckinItems = itemsOf(AdminCheckin).openapi(
  "AdminCheckinItems",
);

export const AdminCheckinQuery = z.object({
  status: z
    .enum(["active"])
    .optional()
    .openapi({
      param: { name: "status", in: "query" },
      description: "active: 滞在中のみ。省略時はactiveな災害の全件",
    }),
});

export const ProxyCheckinRequest = z
  .object({ name: Name })
  .openapi("ProxyCheckinRequest");

export const ProxyCheckinResponse = z
  .object({ user: User, checkin: Checkin })
  .openapi("ProxyCheckinResponse");
