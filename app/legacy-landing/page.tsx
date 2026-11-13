import { LandingExperience } from "@/components/landing/LandingExperience";
import { LandingNav } from "@/components/landing/LandingNav";

/** Unlinked copy of the old `/` AIA landing. Testers should use `/` → `/gia`. */
export default function LegacyLandingPage() {
  return (
    <>
      <LandingNav />
      <LandingExperience />
    </>
  );
}
