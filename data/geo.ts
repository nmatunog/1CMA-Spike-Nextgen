/** PSA-style region codes + province slugs aligned with lib/i18n/region-persona.ts */

export type RegionOption = { code: string; name: string };

export const REGIONS: RegionOption[] = [
  { code: "NCR", name: "National Capital Region (NCR)" },
  { code: "III", name: "Region III — Central Luzon" },
  { code: "IV-A", name: "Region IV-A — CALABARZON" },
  { code: "VII", name: "Region VII — Central Visayas" },
  { code: "VIII", name: "Region VIII — Eastern Visayas" },
  { code: "IX", name: "Region IX — Zamboanga Peninsula" },
  { code: "X", name: "Region X — Northern Mindanao" },
  { code: "XI", name: "Region XI — Davao" },
  { code: "OTHER", name: "Other / Abroad" },
];

export type ProvinceOption = { slug: string; name: string };

export const PROVINCES_BY_REGION: Record<string, ProvinceOption[]> = {
  NCR: [{ slug: "ncr_metro", name: "Metro Manila (NCR)" }],
  III: [
    { slug: "bulacan", name: "Bulacan" },
    { slug: "pampanga", name: "Pampanga" },
    { slug: "tarlac", name: "Tarlac" },
  ],
  "IV-A": [
    { slug: "cavite", name: "Cavite" },
    { slug: "laguna", name: "Laguna" },
    { slug: "batangas", name: "Batangas" },
  ],
  VII: [
    { slug: "bohol", name: "Bohol" },
    { slug: "cebu", name: "Cebu" },
    { slug: "siquijor", name: "Siquijor" },
    { slug: "negros_oriental", name: "Negros Oriental" },
  ],
  VIII: [
    { slug: "southern_leyte", name: "Southern Leyte" },
    { slug: "leyte", name: "Leyte" },
  ],
  IX: [
    { slug: "zamboanga_del_norte", name: "Zamboanga del Norte" },
    { slug: "zamboanga_del_sur", name: "Zamboanga del Sur" },
    { slug: "zamboanga_sibugay", name: "Zamboanga Sibugay" },
    { slug: "zamboanga_city", name: "Zamboanga City" },
  ],
  X: [{ slug: "misamis_occidental", name: "Misamis Occidental" }],
  XI: [{ slug: "davao_del_sur", name: "Davao del Sur" }],
  OTHER: [{ slug: "unspecified", name: "Unspecified" }],
};

export function getProvincesForRegion(regionCode: string): ProvinceOption[] {
  return PROVINCES_BY_REGION[regionCode] ?? [];
}
