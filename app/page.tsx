import { redirect } from "next/navigation";

/** Welcome visitors on the SPIKE landing page; full chat remains at /gia. */
export default function HomePage() {
  redirect("/spike-preview");
}
