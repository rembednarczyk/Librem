import { describe, it, expect } from "vitest";
import { matchOfferToBook, normalizeForMatch } from "../vintedMatch";

const TITLE = "Czarne słońce";
const AUTHOR = "Rebecca Roanhorse";

describe("normalizeForMatch", () => {
  it("folds Polish diacritics and flattens punctuation to single spaces", () => {
    expect(normalizeForMatch("Czarne-Słońce, powieść!")).toBe("czarne slonce powiesc");
  });
});

describe("matchOfferToBook", () => {
  it("accepts a listing that carries the title and author (strong)", () => {
    expect(matchOfferToBook("Czarne słońce Rebecca Roanhorse", TITLE, AUTHOR)).toEqual({ accept: true, strong: true });
  });

  it("matches despite dropped diacritics (Vinted listings often do)", () => {
    expect(matchOfferToBook("czarne slonce roanhorse fantasy", TITLE, AUTHOR)).toEqual({ accept: true, strong: true });
  });

  it("matches despite surrounding words and punctuation", () => {
    expect(matchOfferToBook("Książka: Czarne Słońce (tom 1) - stan bdb", TITLE, AUTHOR).accept).toBe(true);
  });

  it("accepts a title-only listing but marks it weak (not strong)", () => {
    expect(matchOfferToBook("Czarne słońce", TITLE, AUTHOR)).toEqual({ accept: true, strong: false });
  });

  it("REJECTS the author's OTHER book — author alone is never enough", () => {
    expect(matchOfferToBook("Trail of Lightning Rebecca Roanhorse", TITLE, AUTHOR).accept).toBe(false);
  });

  it("REJECTS a short substring of the title (the old 'Słońce' false positive)", () => {
    expect(matchOfferToBook("Słońce", TITLE, AUTHOR).accept).toBe(false);
    expect(matchOfferToBook("Czarne", TITLE, AUTHOR).accept).toBe(false);
  });

  it("respects word boundaries — 'sun' does not match 'sunday'", () => {
    expect(matchOfferToBook("Sunday morning", "sun", "").accept).toBe(false);
    expect(matchOfferToBook("The sun also rises", "sun", "").accept).toBe(true);
  });

  it("ignores short author tokens (initials) when corroborating", () => {
    // „J" is < 3 chars → not used; the surname still corroborates.
    expect(matchOfferToBook("Diuna Herbert", "Diuna", "F. J. Herbert").strong).toBe(true);
    expect(matchOfferToBook("Diuna", "Diuna", "F. J. Herbert").strong).toBe(false);
  });

  it("returns no match for empty inputs", () => {
    expect(matchOfferToBook("", TITLE, AUTHOR).accept).toBe(false);
    expect(matchOfferToBook("Czarne słońce", "", AUTHOR).accept).toBe(false);
  });
});
