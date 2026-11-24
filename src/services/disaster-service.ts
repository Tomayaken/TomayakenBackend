import { getDb } from "../db/client.js";
import { AppError } from "../errors/app-error.js";
import * as disasterRepository from "../repositories/disaster-repository.js";

function toDisaster(row: disasterRepository.DisasterRow) {
  return {
    ...row,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

export async function getActiveDisaster() {
  const row = await disasterRepository.findActive(getDb());
  return row ? toDisaster(row) : null;
}

export async function listDisasters() {
  const rows = await disasterRepository.findAll(getDb());
  return rows.map(toDisaster);
}

export async function startDisaster(name: string) {
  const row = await disasterRepository.insertActive(getDb(), name);
  if (!row) throw new AppError("DISASTER_ALREADY_ACTIVE");
  return toDisaster(row);
}

export async function closeDisaster(disasterId: string) {
  return getDb().transaction(async (tx) => {
    const row = await disasterRepository.markClosed(tx, disasterId);
    if (!row) {
      const exists = await disasterRepository.exists(tx, disasterId);
      throw new AppError(
        exists ? "DISASTER_ALREADY_CLOSED" : "DISASTER_NOT_FOUND",
      );
    }
    if (!row.endedAt) throw new Error("Closed disaster has no end time");

    await disasterRepository.checkOutDisasterCheckins(tx, row.id, row.endedAt);
    return toDisaster(row);
  });
}
