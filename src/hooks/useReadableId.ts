import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A page whose link carries the record's readable ID (/superadmin/staff/DT-261001/schedule,
 * /admin/patients/PT-26100001) needs the database id behind it. `lookup` finds it from
 * the readable ID; a link still carrying the long id (an old bookmark) works as it is.
 * A link from a list passes the id along (navigate(..., { state: { id } })), so then
 * there's nothing to look up. `id` is null until known; `missing` once nothing answers.
 */
export function useReadableId(lookup: (key: string) => Promise<string | null | undefined>) {
  const { id: key = "" } = useParams();
  const passed = (useLocation().state as { id?: unknown } | null)?.id;
  const given = typeof passed === "string" ? passed : UUID.test(key) ? key : null;
  const direct = !!given;
  const [found, setFound] = useState<{ key: string; id: string | null } | null>(null);

  useEffect(() => {
    if (direct || !key) return;
    let live = true;
    lookup(key.toUpperCase())
      .then((id) => { if (live) setFound({ key, id: id ?? null }); })
      .catch(() => { if (live) setFound({ key, id: null }); });
    return () => { live = false; };
    // The lookup is the page's own, fixed for its life.
  }, [key, direct]); // eslint-disable-line react-hooks/exhaustive-deps

  if (given) return { id: given, missing: false };
  const done = found?.key === key;
  return { id: done ? found!.id : null, missing: (done && !found!.id) || !key };
}
