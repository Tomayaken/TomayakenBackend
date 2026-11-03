// エラーコードとHTTPステータスの対応（docs/api.md「エラー形式」）
export const ERROR_STATUS = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  SHELTER_NOT_FOUND: 404,
  BEACON_NOT_FOUND: 404,
  CHECKIN_NOT_FOUND: 404,
  SUPPLY_NOT_FOUND: 404,
  DISASTER_NOT_FOUND: 404,
  ALREADY_CHECKED_IN: 409,
  NOT_CHECKED_IN: 409,
  INSUFFICIENT_SUPPLY: 409,
  NO_ACTIVE_DISASTER: 409,
  DISASTER_ALREADY_ACTIVE: 409,
  DISASTER_ALREADY_CLOSED: 409,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export type ErrorStatus = (typeof ERROR_STATUS)[ErrorCode];

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  INVALID_REQUEST: "Invalid request.",
  UNAUTHORIZED: "Unauthorized.",
  FORBIDDEN: "Forbidden.",
  NOT_FOUND: "Not found.",
  USER_NOT_FOUND: "User not found.",
  SHELTER_NOT_FOUND: "Shelter not found.",
  BEACON_NOT_FOUND: "Beacon not found.",
  CHECKIN_NOT_FOUND: "Check-in not found.",
  SUPPLY_NOT_FOUND: "Supply not found.",
  DISASTER_NOT_FOUND: "Disaster not found.",
  ALREADY_CHECKED_IN: "Some users are already checked in to another shelter.",
  NOT_CHECKED_IN: "Already checked out.",
  INSUFFICIENT_SUPPLY: "Insufficient supply.",
  NO_ACTIVE_DISASTER: "There is no active disaster.",
  DISASTER_ALREADY_ACTIVE: "A disaster is already active.",
  DISASTER_ALREADY_CLOSED: "The disaster is already closed.",
  INTERNAL_ERROR: "Internal server error.",
  NOT_IMPLEMENTED: "Not implemented yet.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: ErrorStatus;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message?: string,
    details?: Record<string, unknown>,
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

// 仕様だけ定義して、まだ実装していないエンドポイント用
export function notImplemented(): never {
  throw new AppError("NOT_IMPLEMENTED");
}
