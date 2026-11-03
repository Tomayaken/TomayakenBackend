import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { adminAuth } from "./middleware/admin-auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import {
  DOCS_PATH,
  OPENAPI_PATH,
  openApiConfig,
  registerSecuritySchemes,
} from "./openapi.js";
import { adminCheckinRoutes } from "./routes/admin/checkins.js";
import { adminDisasterRoutes } from "./routes/admin/disasters.js";
import { adminSupplyRoutes } from "./routes/admin/supplies.js";
import { beaconRoutes } from "./routes/beacons.js";
import { checkinRoutes } from "./routes/checkins.js";
import { disasterRoutes } from "./routes/disasters.js";
import { meRoutes } from "./routes/me.js";
import { createRouter } from "./routes/router.js";
import { shelterRoutes } from "./routes/shelters.js";
import { supplyRoutes } from "./routes/supplies.js";
import { userRoutes } from "./routes/users.js";

export function createApp() {
  const app = createRouter();

  if (process.env.NODE_ENV !== "test") {
    app.use(logger());
  }
  app.use(
    "/api/*",
    cors({
      // 未設定なら全Originを許可する（開発用）。本番は CORS_ORIGIN を設定する
      origin: process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) ?? "*",
    }),
  );
  app.use("/api/v1/admin/*", adminAuth);

  const api = createRouter()
    .route("/", shelterRoutes)
    .route("/", beaconRoutes)
    .route("/", disasterRoutes)
    .route("/", supplyRoutes)
    .route("/", userRoutes)
    .route("/", meRoutes)
    .route("/", checkinRoutes)
    .route("/", adminCheckinRoutes)
    .route("/", adminSupplyRoutes)
    .route("/", adminDisasterRoutes);
  app.route("/api/v1", api);

  registerSecuritySchemes(app);
  app.doc(OPENAPI_PATH, openApiConfig);
  app.get(DOCS_PATH, swaggerUI({ url: OPENAPI_PATH }));

  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

export const app = createApp();
export type App = typeof app;
