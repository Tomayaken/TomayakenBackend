export type LatLng = { latitude: number; longitude: number };

/** 地球の平均半径（m） */
const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * 2点間の球面上の直線距離（m）をハーバーサイン公式で求める。道のりではない。
 * 地球を球とみなすので、楕円体での距離と比べて最大0.5%程度ずれる。
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  // 誤差で h が 1 をわずかに超えると asin が NaN になるので抑える
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, h)));
}
