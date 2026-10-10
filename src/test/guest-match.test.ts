import { describe, expect, it } from "vitest";
import { ageFrom, assessLink, compareAge, compareGender, compareName, comparePhone } from "@/lib/guestMatch";

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

describe("whether a guest may be linked to an account", () => {
  const rosa = { name: "Rosa Mendoza", contact: "0917 123 4567", age: 32, gender: "Female" };
  const verdict = (account: Partial<typeof rosa>) => assessLink(rosa, { ...rosa, ...account }).verdict;

  it("ok only when the name and number match and nothing else differs", () => {
    expect(verdict({ contact: "0917-123-4567", age: 33 })).toBe("ok");
  });

  it("needs confirming when anything is off or can't be checked", () => {
    expect(verdict({ name: "Rosa M. Mendoza" })).toBe("verify");  // name only close
    expect(verdict({ contact: "0920 777 8888" })).toBe("verify"); // same name, new number
    expect(verdict({ contact: null })).toBe("verify");            // nothing to compare the number with
    expect(verdict({ age: 50 })).toBe("verify");
    expect(verdict({ gender: "Male" })).toBe("verify");
    expect(verdict({ name: "Rosa Santos" })).toBe("verify");      // married name, same number
  });

  it("blocked when the name differs and the number doesn't back it up", () => {
    expect(verdict({ name: "Ben Cruz", contact: "0919 999 0000" })).toBe("blocked");
    expect(verdict({ name: "Ben Cruz", contact: null })).toBe("blocked");
  });

  it("says whether a detail actually differs (which needs a reason)", () => {
    expect(assessLink(rosa, { ...rosa, name: "Rosa M. Mendoza" }).anyDiffers).toBe(false);
    expect(assessLink(rosa, { ...rosa, contact: "0920 777 8888" }).anyDiffers).toBe(true);
  });
});
