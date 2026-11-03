import { createRoute } from "@hono/zod-openapi";
import { notImplemented } from "../errors/app-error.js";
import { userAuth } from "../middleware/user-auth.js";
import { Checkin, CheckinItems, CheckinRequest } from "../schemas/checkin.js";
import { errorResponses, jsonBody, jsonContent } from "../schemas/common.js";
import { CheckinIdParam, ShelterIdParam } from "../schemas/params.js";
import { createRouter, userSecurity } from "./router.js";

const checkin = createRoute({
  operationId: "checkin",
  method: "post",
  path: "/shelters/{shelterId}/checkins",
  tags: ["CheckIn"],
  summary: "チェックイン（世帯まとめて可）",
  description: [
    "全員分を1トランザクションで処理する。",
    "- 同じ避難所に滞在中のユーザーは既存のチェックインを返す（冪等）。",
    "- 別の避難所に滞在中のユーザーが1人でもいれば、全体を取り消して ALREADY_CHECKED_IN を返す。details.conflicts に対象ユーザーと滞在先（CheckinConflict の配列）が入る。",
    "- チェックインはactiveな災害に自動で紐づく。",
  ].join("\n"),
  security: userSecurity,
  middleware: [userAuth] as const,
  request: { params: ShelterIdParam, body: jsonBody(CheckinRequest) },
  responses: {
    201: jsonContent(CheckinItems, "チェックイン（既存分を含む）"),
    ...errorResponses(
      "INVALID_REQUEST",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "SHELTER_NOT_FOUND",
      "NO_ACTIVE_DISASTER",
      "ALREADY_CHECKED_IN",
    ),
  },
});

const checkout = createRoute({
  operationId: "checkout",
  method: "post",
  path: "/checkins/{checkinId}/checkout",
  tags: ["CheckIn"],
  summary: "チェックアウト（世帯メンバー分も可）",
  security: userSecurity,
  middleware: [userAuth] as const,
  request: { params: CheckinIdParam },
  responses: {
    200: jsonContent(Checkin, "更新後のチェックイン"),
    ...errorResponses(
      "INVALID_REQUEST",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "CHECKIN_NOT_FOUND",
      "NOT_CHECKED_IN",
    ),
  },
});

export const checkinRoutes = createRouter()
  .openapi(checkin, () => notImplemented())
  .openapi(checkout, () => notImplemented());
