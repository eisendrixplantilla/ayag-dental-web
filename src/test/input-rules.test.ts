import { describe, expect, it } from "vitest";
import { cleanName, formatMobile, formatName, mobileIncomplete, mobileProblem } from "@/lib/inputRules";

describe("names as they're typed", () => {
  it("capitalizes the first letter of every word", () => {
    expect(formatName("juan miguel")).toBe("Juan Miguel");
    expect(formatName("dela cruz")).toBe("Dela Cruz");
  });

  it("capitalizes each part of a hyphenated name", () => {
    expect(formatName("villanueva-macapagal")).toBe("Villanueva-Macapagal");
  });

  it("leaves the rest of the word as typed", () => {
    expect(formatName("McArthur")).toBe("McArthur");
    expect(formatName("ma. santos")).toBe("Ma. Santos");
    expect(formatName("o'neil")).toBe("O'neil");
  });

  it("keeps letters with accents", () => {
    expect(formatName("josé peña")).toBe("José Peña");
  });

  it("drops numbers and symbols", () => {
    expect(formatName("juan2")).toBe("Juan");
    expect(formatName("ana@#")).toBe("Ana");
  });

  it("allows one space between words, and keeps a trailing one while typing", () => {
    expect(formatName("  juan   dela ")).toBe("Juan Dela ");
    expect(cleanName("  juan   dela ")).toBe("Juan Dela");
  });
});

describe("contact numbers as they're typed", () => {
  it("keeps digits only and stops at eleven", () => {
    expect(formatMobile("0917abc1234567")).toBe("09171234567");
    expect(formatMobile("0917-123-4567")).toBe("09171234567");
  });

  it("turns the international form into the local one", () => {
    expect(formatMobile("+63 917 123 4567")).toBe("09171234567");
    expect(formatMobile("639171234567")).toBe("09171234567");
    expect(formatMobile("9171234567")).toBe("09171234567");
  });

  it("says what's missing", () => {
    expect(mobileProblem("")).toBeNull();
    expect(mobileProblem("0")).toBe("1 of 11 digits");
    expect(mobileProblem("0917123")).toBe("7 of 11 digits");
    expect(mobileProblem("12345678901")).toBe("Must start with 09");
    expect(mobileProblem("08171234567")).toBe("Must start with 09");
    expect(mobileProblem("09171234567")).toBeNull();
  });

  it("tells a number still being typed from a wrong one", () => {
    expect(mobileIncomplete("0917")).toBe(true);
    expect(mobileIncomplete("1234")).toBe(false);
    expect(mobileIncomplete("09171234567")).toBe(false);
  });
});
