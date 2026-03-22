import { OnboardingForm } from "@/components/onboarding-form";
import { AppHeader } from "@/components/app-header";

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <main
        style={{
          padding: "2rem 1.25rem 4rem",
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        <p
          style={{
            color: "var(--aia-cyan)",
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            margin: "0 0 0.5rem",
          }}
        >
          Recruitment · Gen Z first
        </p>
        <OnboardingForm />
      </main>
    </>
  );
}
