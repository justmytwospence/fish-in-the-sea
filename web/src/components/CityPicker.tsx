"use client";
import PlaceSearch from './PlaceSearch';
export default function CityPicker({ marketName,onPick }: { marketName:string; onPick:(market:string)=>void }) {
  return <PlaceSearch label="City or metro area" placeholder={marketName} onPick={hit=>onPick(hit.market)} />;
}
