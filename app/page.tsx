import { redirect } from "next/navigation";

/** Temporary: send testers to GIA instead of the old AIA landing. */
export default function HomePage() {
  redirect("/gia");
}
