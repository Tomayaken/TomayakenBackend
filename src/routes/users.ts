import { createRoute } from "@hono/zod-openapi";
import { notImplemented } from "../errors/app-error.js";
import { errorResponses, jsonBody, jsonContent } from "../schemas/common.js";
import { UserIdParam } from "../schemas/params.js";
import { PutUserRequest, User } from "../schemas/user.js";
import { createRouter } from "./router.js";

const putUser = createRoute({
  operationId: "putUser",
  method: "put",
  path: "/users/{userId}",
  tags: ["User"],
  security: [],
  summary: "利用者登録・名前更新",
  description:
    "アプリが初回起動時に生成したUUIDで利用者を登録する。冪等で、既存なら名前を更新する。新規作成時はその利用者だけの世帯を同時に作る。X-User-Id は不要。",
  request: { params: UserIdParam, body: jsonBody(PutUserRequest) },
  responses: {
    200: jsonContent(User, "登録・更新後の利用者"),
    ...errorResponses("INVALID_REQUEST"),
  },
});

export const userRoutes = createRouter().openapi(putUser, () =>
  notImplemented(),
);
