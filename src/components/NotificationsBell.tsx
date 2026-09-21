import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, CheckCheck } from "lucide-react";
import { formatManilaDateTime } from "@/lib/formatDate";
import { useNotifications, type NotificationItem } from "@/contexts/NotificationsContext";

export function NotificationsBell() {
  const navigate = useNavigate();
  const { items, unreadCount, isRead, markRead, markAllRead, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  // Set while closing the menu because a notification was picked, see onCloseAutoFocus.
  const jumpingRef = useRef(false);

  const goToSource = (n: NotificationItem) => {
    markRead(n);
    jumpingRef.current = true;
    setOpen(false);
    navigate(n.route, { state: { highlightId: n.id } });
  };

  return (
    // Non-modal: a modal menu locks page scrolling until its close animation ends,
    // which can swallow the scroll to the row being jumped to.
    <DropdownMenu modal={false} open={open} onOpenChange={(next) => { setOpen(next); if (next) refresh(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}>
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px] leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-96 max-h-[28rem] overflow-y-auto bg-popover"
        onCloseAutoFocus={(e) => {
          // On close the menu hands focus back to the bell, and focusing an element
          // scrolls it into view — dragging the page back to the top and undoing the
          // jump to the highlighted row. Skip that only when we're navigating away.
          if (jumpingRef.current) {
            e.preventDefault();
            jumpingRef.current = false;
          }
        }}
      >
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-sm font-semibold">Notifications</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all as read
          </Button>
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          items.map(n => {
            const unread = !isRead(n);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => goToSource(n)}
                className={`w-full flex items-start gap-2 px-2 py-2 text-sm text-left rounded-sm hover:bg-accent ${unread ? "bg-primary/5" : ""}`}
              >
                <n.icon className={`w-4 h-4 mt-0.5 shrink-0 ${n.colorClass}`} />
                <div className="min-w-0 flex-1">
                  <p className={`leading-snug ${unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatManilaDateTime(n.time)}</p>
                </div>
                {unread && <span className="w-2 h-2 mt-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </button>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
