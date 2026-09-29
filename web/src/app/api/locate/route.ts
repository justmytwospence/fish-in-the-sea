import { nearestMarket } from "@/lib/server-data";

// Browser geolocation fallback: the client sends rounded coordinates and gets
// back the market. Nothing is stored.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const hit = await nearestMarket(Number(p.get("lat")), Number(p.get("lon")));
  return Response.json(hit, { status: hit ? 200 : 404 });
}
