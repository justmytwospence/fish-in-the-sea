import { nearestMarket } from "@/lib/server-data";

// Browser geolocation fallback: the client sends rounded coordinates and gets
// back the market. Nothing is stored.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (!p.has('lat') || !p.has('lon')) return Response.json(null, { status:400 });
  const lat = Number(p.get('lat')), lon = Number(p.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return Response.json(null, { status:400 });
  const hit = await nearestMarket(lat, lon);
  return Response.json(hit, { status: hit ? 200 : 404 });
}
