import { getDb } from "../db/client.js";
import { AppError } from "../errors/app-error.js";
import { distanceMeters, type LatLng } from "../lib/geo.js";
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

export type NearbyShelter = Pick<
  Shelter,
  | "id"
  | "name"
  | "capacity"
  | "currentOccupancy"
  | "isOverCapacity"
  | "latitude"
  | "longitude"
> & {
  /** 現在地から避難所までの直線距離（m、四捨五入） */
  distanceMeters: number;
};

/**
 * 現在地から近い順に避難所を返す。距離の上限は設けない（どこまでを近いとみなすかはアプリが決める）。
 * 避難所は数十件程度の想定なので、全件の距離を計算して並べ替える。
 * 件数が増えたら PostGIS などの空間インデックスを検討する（docs/api.md）。
 */
export async function listNearbyShelters(
  from: LatLng,
  limit: number,
): Promise<NearbyShelter[]> {
  const rows = await shelterRepository.findAll(getDb());
  return (
    rows
      .map((row) => ({ row, distance: distanceMeters(from, row) }))
      // 距離が同じなら登録順（findAll の順）のまま。Array.prototype.sort は安定
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map(({ row, distance }) => {
        const shelter = toShelter(row);
        return {
          id: shelter.id,
          name: shelter.name,
          capacity: shelter.capacity,
          currentOccupancy: shelter.currentOccupancy,
          isOverCapacity: shelter.isOverCapacity,
          latitude: shelter.latitude,
          longitude: shelter.longitude,
          distanceMeters: Math.round(distance),
        };
      })
  );
}

export async function getShelter(shelterId: string): Promise<Shelter> {
  const row = await shelterRepository.findById(getDb(), shelterId);
  if (!row) {
    throw new AppError("SHELTER_NOT_FOUND");
  }
  return toShelter(row);
}
