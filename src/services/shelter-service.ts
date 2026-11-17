import { getDb } from "../db/client.js";
import { AppError } from "../errors/app-error.js";
import type { ShelterRow } from "../repositories/shelter-repository.js";
import * as shelterRepository from "../repositories/shelter-repository.js";

export type Shelter = ShelterRow & {
  /** currentOccupancy > capacity。満員でもチェックインは拒否しない */
  isOverCapacity: boolean;
};

function toShelter(row: ShelterRow): Shelter {
  return { ...row, isOverCapacity: row.currentOccupancy > row.capacity };
}

export async function listShelters(): Promise<Shelter[]> {
  const rows = await shelterRepository.findAll(getDb());
  return rows.map(toShelter);
}

export async function getShelter(shelterId: string): Promise<Shelter> {
  const row = await shelterRepository.findById(getDb(), shelterId);
  if (!row) {
    throw new AppError("SHELTER_NOT_FOUND");
  }
  return toShelter(row);
}
