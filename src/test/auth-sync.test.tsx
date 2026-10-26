import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function WhoAmI() {
  const { user } = useAuth();
  return <p>{user ? `${user.role}:${user.email}` : "signed out"}</p>;
}

/** What the browser does in this tab when another tab of the app writes the session. */
function otherTabSaves(user: object | null) {
  if (user) {
    localStorage.setItem("ayag_auth_token", "token-from-other-tab");
    localStorage.setItem("ayag_auth_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("ayag_auth_token");
    localStorage.removeItem("ayag_auth_user");
  }
  window.dispatchEvent(new StorageEvent("storage", { key: "ayag_auth_user" }));
}

describe("a sign-in in another tab", () => {
  it("is followed here, so this tab never shows one account while sending another's token", () => {
    localStorage.setItem("ayag_auth_token", "super-token");
    localStorage.setItem("ayag_auth_user", JSON.stringify({ id: "s", email: "super@admin.com", name: "Super", role: "superadmin" }));
    render(<AuthProvider><WhoAmI /></AuthProvider>);
    expect(screen.getByText("superadmin:super@admin.com")).toBeInTheDocument();

    act(() => otherTabSaves({ id: "a", email: "admin@admin.com", name: "Admin", role: "admin" }));
    expect(screen.getByText("admin:admin@admin.com")).toBeInTheDocument();

    act(() => otherTabSaves(null));
    expect(screen.getByText("signed out")).toBeInTheDocument();
  });
});
