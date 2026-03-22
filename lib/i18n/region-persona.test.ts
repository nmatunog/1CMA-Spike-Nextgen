import { describe, expect, it } from "vitest";
import { ChatPersona } from "./chat-persona";
import { resolveChatPersona } from "./region-persona";

describe("resolveChatPersona", () => {
  it("uses Conyo Bisaya for Cebuano allowlist provinces", () => {
    expect(
      resolveChatPersona({ regionCode: "VII", provinceSlug: "cebu" }),
    ).toBe(ChatPersona.ConyoBisaya);
    expect(
      resolveChatPersona({ regionCode: "IX", provinceSlug: "zamboanga_city" }),
    ).toBe(ChatPersona.ConyoBisaya);
  });

  it("uses Taglish for NCR / Taglish regions", () => {
    expect(
      resolveChatPersona({ regionCode: "NCR", provinceSlug: "ncr_metro" }),
    ).toBe(ChatPersona.TaglishConyo);
    expect(
      resolveChatPersona({ regionCode: "IV-A", provinceSlug: "cavite" }),
    ).toBe(ChatPersona.TaglishConyo);
  });

  it("defaults to peer English for unmapped regions", () => {
    expect(
      resolveChatPersona({ regionCode: "OTHER", provinceSlug: "unspecified" }),
    ).toBe(ChatPersona.PeerEn);
  });

  it("respects user override", () => {
    expect(
      resolveChatPersona({
        regionCode: "OTHER",
        provinceSlug: "unspecified",
        userOverridePersona: ChatPersona.ConyoBisaya,
      }),
    ).toBe(ChatPersona.ConyoBisaya);
  });
});
