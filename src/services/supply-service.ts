import { getDb } from "../db/client.js";
import { AppError } from "../errors/app-error.js";
import * as shelterRepository from "../repositories/shelter-repository.js";
import type { ShelterSupplyRow } from "../repositories/supply-repository.js";
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
