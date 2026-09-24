import { describe, expect, it } from "vitest";
import { normalizeSearchText, buildSearchText } from "@/lib/search-normalize";

describe("normalizeSearchText", () => {
  it("lowercases mixed-case Latin text", () => {
    expect(normalizeSearchText("Uzbek PLOV")).toEqual("uzbek plov");
  });

  it("lowercases Cyrillic text", () => {
    expect(normalizeSearchText("УЗБЕКСКИЙ ПЛОВ")).toEqual("узбекский плов");
  });

  it("strips diacritics via NFKD decomposition", () => {
    expect(normalizeSearchText("café")).toEqual("cafe");
  });

  it("collapses Uzbek Latin apostrophe variants to the same form", () => {
    const straight = normalizeSearchText("o'sh");
    const curly = normalizeSearchText("o\u2019sh");
    const modifier = normalizeSearchText("o\u02BBsh");
    expect(straight).toEqual(curly);
    expect(curly).toEqual(modifier);
    expect(straight).toEqual("osh");
  });

  it("collapses repeated whitespace and trims", () => {
    expect(normalizeSearchText("  uzbek   plov  ")).toEqual("uzbek plov");
  });
});

describe("buildSearchText", () => {
  it("joins and normalizes multiple parts, skipping null/undefined", () => {
    expect(
      buildSearchText("Osh Markazi", null, "Ош Маркази", undefined, "Traditional Plov"),
    ).toEqual("osh markazi ош маркази traditional plov");
  });

  it("returns an empty string when all parts are empty", () => {
    expect(buildSearchText(null, undefined, "")).toEqual("");
  });
});
