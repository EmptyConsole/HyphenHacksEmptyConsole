/** Same zoom-17 tile math as detect-villages.js, so the UI can predict its 400-tile limit. */
const ZOOM = 17;

const tileX = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** ZOOM);

function tileY(lat: number) {
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(rad) + 1 / Math.cos(rad));
  return Math.floor(((1 - merc / Math.PI) / 2) * 2 ** ZOOM);
}

export function tileCount(south: number, west: number, north: number, east: number) {
  return (tileX(east) - tileX(west) + 1) * (tileY(south) - tileY(north) + 1);
}
