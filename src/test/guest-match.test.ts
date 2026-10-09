import { describe, expect, it } from "vitest";
import { ageFrom, compareAge, compareGender, compareName, comparePhone } from "@/lib/guestMatch";

describe("comparing a walk-in guest with a patient account", () => {
  it("names: same full name matches; same first and last name is worth a check", () => {
    expect(compareName("Rosa Mendoza", "rosa  mendoza")).toBe("match");
    expect(compareName("Rosa Mendoza", "Rosa M. Mendoza")).toBe("close");
    expect(compareName("Rosa Mendoza", "Rosa Santos")).toBe("differs");
    expect(compareName("", "Rosa Mendoza")).toBe("unknown");
  });

  it("phones: compared by digits only", () => {
    expect(comparePhone("0917 123 4567", "0917-123-4567")).toBe("match");
    expect(comparePhone("09171234567", "09181234567")).toBe("differs");
    expect(comparePhone(null, "09171234567")).toBe("unknown");
  });

  it("ages: a year apart still matches, a few years is worth a check", () => {
    expect(compareAge(32, 33)).toBe("match");
    expect(compareAge(32, 35)).toBe("close");
    expect(compareAge(32, 50)).toBe("differs");
    expect(compareAge(null, 30)).toBe("unknown");
  });

  it("gender: ignores case", () => {
    expect(compareGender("Female", "female")).toBe("match");
    expect(compareGender("Female", "Male")).toBe("differs");
    expect(compareGender("Female", null)).toBe("unknown");
  });

  it("works out an age from a birthdate, counting the birthday", () => {
    const today = new Date(2026, 9, 10); // Oct 10, 2026
    expect(ageFrom("1994-10-10", today)).toBe(32);
    expect(ageFrom("1994-10-11", today)).toBe(31);
    expect(ageFrom(null, today)).toBeNull();
  });
});
