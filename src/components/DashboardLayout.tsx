import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { NotificationsBell } from "@/components/NotificationsBell";
import { NotificationsProvider, useNotifications } from "@/contexts/NotificationsContext";
import {
  Users, CalendarDays, ListOrdered, Package, DollarSign, FileText, LogOut,
  CalendarPlus, History, LayoutDashboard, ClipboardList, FolderOpen, CalendarCheck,
  UserCog, Settings, BarChart3, Shield, Archive
} from "lucide-react";

const adminNav = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Appointment", url: "/admin/online-appointments", icon: CalendarPlus },
  { title: "Walk-in Appointment", url: "/admin/appointments", icon: CalendarDays },
  { title: "Patient Records", url: "/admin/patients", icon: FolderOpen },
  { title: "Patient Accounts", url: "/admin/accounts", icon: Users },
  { title: "Reports", url: "/admin/reports", icon: FileText },
  { title: "Profile", url: "/admin/profile", icon: UserCog },
];

const patientNav = [
  { title: "Dashboard", url: "/patient", icon: LayoutDashboard },
  { title: "Book Appointment", url: "/patient/book", icon: CalendarPlus },
  { title: "My Appointments", url: "/patient/appointments", icon: CalendarDays },
  { title: "Dental Records", url: "/patient/records", icon: FolderOpen },
  { title: "Profile", url: "/patient/profile", icon: UserCog },
];

const superAdminNav = [
  { title: "Dashboard", url: "/superadmin", icon: LayoutDashboard },
  { title: "Staff Management", url: "/superadmin/staff", icon: UserCog },
  { title: "Archive", url: "/superadmin/archives", icon: Archive },
  { title: "System Settings", url: "/superadmin/settings", icon: Settings },
  { title: "Reports & Analytics", url: "/superadmin/reports", icon: BarChart3 },
  { title: "Profile", url: "/superadmin/profile", icon: UserCog },
];

const dentistNav = [
  { title: "Dashboard", url: "/dentist", icon: LayoutDashboard },
  { title: "My Schedule", url: "/dentist/schedule", icon: CalendarCheck },
  { title: "My Appointments", url: "/dentist/appointments", icon: CalendarDays },
  { title: "Patient History", url: "/dentist/patient-history", icon: History },
  { title: "Dental Records", url: "/dentist/records", icon: FolderOpen },
  { title: "Profile", url: "/dentist/profile", icon: UserCog },
];

function getNav(role: string) {
  if (role === "superadmin") return superAdminNav;
  if (role === "admin") return adminNav;
  if (role === "dentist") return dentistNav;
  return patientNav;
}

function getRoleLabel(role: string) {
  if (role === "superadmin") return "Super Admin";
  if (role === "admin") return "Clinic Staff";
  if (role === "dentist") return "Dentist";
  return "Patient";
}

function AppSidebar() {
  const { user, logout } = useAuth();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { unreadByRoute } = useNotifications();
  const collapsed = state === "collapsed";
  const nav = getNav(user?.role || "patient");
  const navigate = useNavigate();
  const homeUrl = nav[0]?.url || "/";

  return (
    <Sidebar collapsible="icon" className="gradient-sidebar border-r-0">
      <SidebarContent>
        <div className="p-4 flex items-center gap-3">
          <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-9 h-9 rounded-xl object-contain flex-shrink-0" />
          {!collapsed && <span className="text-lg font-bold font-heading text-sidebar-foreground">Ayag Dental</span>}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            {!collapsed && "Menu"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map(item => {
                const unread = unreadByRoute[item.url] ?? 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === homeUrl}
                        className="text-sidebar-foreground/70 hover:bg-sidebar-accent"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                        // On phones the sidebar is an overlay drawer covering the page, so
                        // picking a module should get it out of the way. Desktop is left alone.
                        onClick={() => { if (isMobile) setOpenMobile(false); }}
                      >
                        <item.icon className="w-4 h-4 mr-2" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                    {unread > 0 && (
                      <>
                        <SidebarMenuBadge
                          aria-label={`${unread} unread`}
                          className="rounded-full bg-primary text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-[active=true]/menu-button:text-primary-foreground"
                        >
                          {unread > 9 ? "9+" : unread}
                        </SidebarMenuBadge>
                        {/* The count badge is hidden in icon-only mode, so fall back to a dot. */}
                        {collapsed && (
                          <span className="pointer-events-none absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
                        )}
                      </>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mt-auto p-4">
          {!collapsed && (
            <div className="mb-3 p-3 rounded-lg bg-sidebar-accent">
              <p className="text-xs text-sidebar-foreground/70">Logged in as</p>
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name}</p>
              <p className="text-xs text-sidebar-foreground/50">{getRoleLabel(user?.role || "patient")}</p>
            </div>
          )}
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => { logout(); navigate("/login"); }}>
            <LogOut className="w-4 h-4 mr-2" />
            {!collapsed && "Sign Out"}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <NotificationsProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border px-4 bg-card">
            <SidebarTrigger className="mr-4" />
            <div className="flex-1" />
            <NotificationsBell />
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {/* A maximised window shouldn't stretch a form or a table the whole way across:
                the content column stops at a readable width and centres itself. */}
            <div className="mx-auto w-full max-w-screen-xl">
              {children}
            </div>
          </main>
        </div>
      </div>
      </NotificationsProvider>
    </SidebarProvider>
  );
}
