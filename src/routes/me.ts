import { createRoute } from "@hono/zod-openapi";
import { notImplemented } from "../errors/app-error.js";
import { userAuth } from "../middleware/user-auth.js";
import { MyCheckinsResponse } from "../schemas/checkin.js";
import { errorResponses, jsonBody, jsonContent } from "../schemas/common.js";
import {
  AddHouseholdMemberRequest,
  Household,
  User,
} from "../schemas/user.js";
import { createRouter, userSecurity } from "./router.js";

const getHousehold = createRoute({
  operationId: "getHousehold",
  method: "get",
  path: "/me/household",
  tags: ["User"],
  summary: "自分の世帯とメンバー",
  security: userSecurity,
  middleware: [userAuth] as const,
  responses: {
    200: jsonContent(Household, "世帯"),
    ...errorResponses("UNAUTHORIZED"),
  },
});

const addHouseholdMember = createRoute({
  operationId: "addHouseholdMember",
  method: "post",
  path: "/me/household/members",
  tags: ["User"],
  summary: "端末を持たない家族を世帯に追加",
  description: "IDはサーバーが生成する。",
  security: userSecurity,
  middleware: [userAuth] as const,
  request: { body: jsonBody(AddHouseholdMemberRequest) },
  responses: {
    201: jsonContent(User, "追加した世帯メンバー"),
    ...errorResponses("INVALID_REQUEST", "UNAUTHORIZED"),
  },
});

const getMyCheckins = createRoute({
  operationId: "getMyCheckins",
  method: "get",
  path: "/me/checkins",
  tags: ["CheckIn"],
  summary: "世帯メンバー全員の現在のチェックイン状態",
  description: "チェックインしていないメンバーは checkin: null。",
  security: userSecurity,
  middleware: [userAuth] as const,
  responses: {
    200: jsonContent(MyCheckinsResponse, "世帯メンバーごとの滞在状態"),
    ...errorResponses("UNAUTHORIZED"),
  },
});

export const meRoutes = createRouter()
  .openapi(getHousehold, () => notImplemented())
  .openapi(addHouseholdMember, () => notImplemented())
  .openapi(getMyCheckins, () => notImplemented());
