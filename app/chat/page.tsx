import { AppHeader } from "@/components/app-header";
import { ChatPanel } from "@/components/chat-panel";

export default function ChatPage() {
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
        <h1
          style={{
            margin: "0 0 1rem",
            fontSize: "1.35rem",
            letterSpacing: "-0.02em",
          }}
        >
          Peer chat <span style={{ color: "var(--muted)", fontWeight: 400 }}>(stub)</span>
        </h1>
        <ChatPanel />
      </main>
    </>
  );
}
