import { getDb } from "../db/client.js";
import { AppError } from "../errors/app-error.js";
import * as disasterRepository from "../repositories/disaster-repository.js";
import * as shelterRepository from "../repositories/shelter-repository.js";
import type {
  ShelterSupplyRow,
  SupplyTransactionRow,
  SupplyTransactionType,
} from "../repositories/supply-repository.js";
import * as supplyRepository from "../repositories/supply-repository.js";

export type ShelterSupply = ShelterSupplyRow;

/** 避難所の在庫一覧。全物資マスタを返し、在庫行がない物資は quantity: 0 */
export async function listShelterSupplies(
  shelterId: string,
): Promise<ShelterSupply[]> {
  const db = getDb();
  if (!(await shelterRepository.existsById(db, shelterId))) {
    throw new AppError("SHELTER_NOT_FOUND");
  }
  return supplyRepository.findStockByShelter(db, shelterId);
}

export type SupplyOperation = {
  quantity: number;
  operatorName?: string;
  note?: string;
};

/**
 * 入庫（IN）・配布（OUT）。在庫の更新と履歴の記録を1トランザクションで行う
 * （docs/database.md「物資の入庫・配布」）。
 * 在庫行をロックしてから数量を読むので、同時に配布しても在庫はマイナスにならない。
 */
export async function operateSupply(
  type: SupplyTransactionType,
  shelterId: string,
  supplyId: string,
  { quantity, operatorName, note }: SupplyOperation,
): Promise<ShelterSupply> {
  return getDb().transaction(async (tx) => {
    if (!(await shelterRepository.existsById(tx, shelterId))) {
      throw new AppError("SHELTER_NOT_FOUND");
    }
    const supply = await supplyRepository.findSupplyById(tx, supplyId);
    if (!supply) throw new AppError("SUPPLY_NOT_FOUND");

    if (type === "IN") {
      await supplyRepository.ensureStockRow(tx, shelterId, supplyId);
    }
    // 配布で在庫行がなければ在庫 0 として扱う（quantity は1以上なので必ず不足になる）
    const current =
      (await supplyRepository.lockStock(tx, shelterId, supplyId)) ?? 0;
    if (type === "OUT" && current < quantity) {
      throw new AppError("INSUFFICIENT_SUPPLY", undefined, {
        available: current,
        requested: quantity,
      });
    }
    const next = type === "IN" ? current + quantity : current - quantity;
    await supplyRepository.updateStock(tx, shelterId, supplyId, next);

    // active な災害がなくても入庫・配布はできる（平時の備蓄）
    const disaster = await disasterRepository.findActive(tx);
    await supplyRepository.insertTransaction(tx, {
      shelterId,
      supplyId,
      type,
      quantity,
      operatorName: operatorName || null,
      note: note || null,
      disasterId: disaster?.id ?? null,
    });
    return { ...supply, quantity: next };
  });
}

export type SupplyTransaction = Omit<SupplyTransactionRow, "createdAt"> & {
  createdAt: string;
};

/** 避難所の入出庫履歴（新しい順）。災害・物資で絞り込める */
export async function listTransactions(
  shelterId: string,
  filter: { disasterId?: string; supplyId?: string },
): Promise<SupplyTransaction[]> {
  const db = getDb();
  if (!(await shelterRepository.existsById(db, shelterId))) {
    throw new AppError("SHELTER_NOT_FOUND");
  }
  const rows = await supplyRepository.findTransactionsByShelter(
    db,
    shelterId,
    filter,
  );
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}
