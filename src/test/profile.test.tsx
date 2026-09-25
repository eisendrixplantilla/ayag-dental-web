import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// The Profile pages run for real. Replaced: the network, and the auth context — whose
// cached `user` is deliberately stale here, because the point of these tests is that the
// page reads the database row instead of what this browser remembers from sign-in.
const h = vi.hoisted(() => ({
  patient: {} as any,
  staff: {} as any,
}));

vi.mock("@/contexts/AuthContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/AuthContext")>();
  return {
    ...actual,
    useAuth: () => ({
      user: {
        id: "3f9c2a1b-0000-4000-8000-000000000000",
        name: "Stale Cached Name",
        email: "stale@example.com",
        role: "patient",
        verified: true,
        employeeId: "EMP-999",
      },
      changePassword: vi.fn(),
    }),
    api: vi.fn(async () => ({})),
  };
});

vi.mock("@/lib/api/patients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/patients")>();
  return { ...actual, getPatient: vi.fn(async () => h.patient), updatePatient: vi.fn(async () => h.patient) };
});

vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return { ...actual, getStaffMember: vi.fn(async () => h.staff), updateStaff: vi.fn(async () => h.staff) };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import PatientProfile from "@/pages/patient/PatientProfile";
import AdminProfile from "@/pages/admin/AdminProfile";
import { patientRef, ageFromBirthdate, formatBirthdate } from "@/lib/patientRef";

afterEach(cleanup);

const PATIENT_ROW = {
  id: "3f9c2a1b-0000-4000-8000-000000000000",
  email: "maria@example.com",
  name: "Maria Lourdes Santos",
  firstName: "Maria",
  middleName: "Lourdes",
  lastName: "Santos",
  role: "patient",
  verified: true,
  phone: "0917 555 1234",
  address: "12 Rizal St, Cabanatuan",
  birthdate: "1998-04-12",
  age: null,
  gender: "Female",
  bloodType: "O+",
  allergies: "Penicillin",
  status: "active" as const,
  photoUrl: null,
  lastLogin: null,
  createdAt: "2025-02-03",
  appointmentsCount: 7,
  dentalRecordsCount: 3,
};

const renderPatient = async (row: Partial<typeof PATIENT_ROW> = {}) => {
  h.patient = { ...PATIENT_ROW, ...row };
  render(<MemoryRouter><PatientProfile /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText("Loading your details...")).not.toBeInTheDocument());
};

describe("the patient's profile", () => {
  it("shows the name and email on the patient record, not the ones cached at sign-in", async () => {
    await renderPatient();
    expect(screen.getByText("Maria Lourdes Santos")).toBeInTheDocument();
    expect(screen.getByText("maria@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Stale Cached Name")).not.toBeInTheDocument();
    expect(screen.queryByText("stale@example.com")).not.toBeInTheDocument();
  });

  it("shows a short Patient ID taken from the row's id, not the raw uuid", async () => {
    await renderPatient();
    expect(screen.getByText("PT-3F9C2A")).toBeInTheDocument();
    expect(screen.queryByText(/3f9c2a1b-0000/i)).not.toBeInTheDocument();
  });

  it("shows the birthdate, sex, blood type and allergies the table holds", async () => {
    await renderPatient();
    expect(screen.getByText(/April 12, 1998/)).toBeInTheDocument();
    expect(screen.getByText("Female")).toBeInTheDocument();
    expect(screen.getByText("O+")).toBeInTheDocument();
    expect(screen.getByText("Penicillin")).toBeInTheDocument();
    expect(screen.getByText("2025-02-03")).toBeInTheDocument();
  });

  it("falls back to the stored age for a row entered without a birthdate", async () => {
    await renderPatient({ birthdate: null, age: 41 });
    expect(screen.getByText("41 years old")).toBeInTheDocument();
  });

  it("says a field is not on file rather than leaving it blank", async () => {
    await renderPatient({ allergies: null, bloodType: null });
    expect(screen.getByText("None on file")).toBeInTheDocument();
    expect(screen.getAllByText("Not on file").length).toBeGreaterThan(0);
  });

  it("puts the saved contact number and address into the editable fields", async () => {
    await renderPatient();
    expect(screen.getByLabelText("Contact Number")).toHaveValue("0917 555 1234");
    expect(screen.getByLabelText(/Address/)).toHaveValue("12 Rizal St, Cabanatuan");
  });
});

describe("a staff member's profile", () => {
  it("shows the Employee ID and role from the users row, not the cached token", async () => {
    h.staff = {
      id: "u-1",
      employeeId: "EMP-007",
      name: "Jane Dela Cruz",
      email: "jane@ayagdental.com",
      contact: "0917 000 1111",
      role: "admin",
      status: "active",
      photoUrl: null,
      createdAt: "2024-11-05",
    };
    render(<MemoryRouter><AdminProfile /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("EMP-007")).toBeInTheDocument());
    expect(screen.queryByText("EMP-999")).not.toBeInTheDocument();
    expect(screen.getByText("Jane Dela Cruz")).toBeInTheDocument();
    expect(screen.getByText("2024-11-05")).toBeInTheDocument();
    // "Clinic Staff" is the label for role=admin, and it now comes from the row.
    expect(screen.getAllByText("Clinic Staff").length).toBeGreaterThan(0);
  });

  it("shows the role the row carries even when it isn't the one the page is named for", async () => {
    h.staff = {
      id: "u-2", employeeId: "EMP-010", name: "Dr. Mike Johnson", email: "mike@ayagdental.com",
      contact: null, role: "dentist", status: "active", photoUrl: null, createdAt: "2024-01-02",
    };
    render(<MemoryRouter><AdminProfile /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("EMP-010")).toBeInTheDocument());
    expect(screen.getAllByText("Dentist").length).toBeGreaterThan(0);
    expect(screen.queryByText("Clinic Staff")).not.toBeInTheDocument();
  });
});

describe("the patient reference helpers", () => {
  it("builds the same short reference every time from the id", () => {
    expect(patientRef("3f9c2a1b-0000-4000-8000-000000000000")).toBe("PT-3F9C2A");
    expect(patientRef("3f9c2a1b-0000-4000-8000-000000000000")).toBe(patientRef("3f9c2a1b-0000-4000-8000-000000000000"));
  });

  it("counts age in whole years, and not a year early before the birthday", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 3, 11)); // April 11 2026 — the day before
      expect(ageFromBirthdate("1998-04-12")).toBe(27);
      vi.setSystemTime(new Date(2026, 3, 12)); // the birthday itself
      expect(ageFromBirthdate("1998-04-12")).toBe(28);
    } finally {
      vi.useRealTimers();
    }
  });

  it("has no birthdate to show when the row has none", () => {
    expect(ageFromBirthdate(null)).toBeNull();
    expect(ageFromBirthdate("")).toBeNull();
  });

  it("formats a birthdate from its parts, so a timezone can't shift the day", () => {
    expect(formatBirthdate("1998-04-12")).toBe("April 12, 1998");
    expect(formatBirthdate("2000-01-01")).toBe("January 1, 2000");
  });
});
