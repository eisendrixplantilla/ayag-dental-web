import { useEffect, useState } from "react";
import { getRecordPhotos, type RecordPhoto } from "@/lib/api/dentalRecords";

/** A record's photos as saved, loaded for the form that edits them. */
export function useRecordPhotos(recordId: string | null | undefined) {
  const [state, setState] = useState<{ loading: boolean; photos: RecordPhoto[]; failed?: boolean }>({ loading: false, photos: [] });
  useEffect(() => {
    if (!recordId) { setState({ loading: false, photos: [] }); return; }
    let live = true;
    setState({ loading: true, photos: [] });
    getRecordPhotos(recordId)
      .then((photos) => { if (live) setState({ loading: false, photos }); })
      .catch(() => { if (live) setState({ loading: false, photos: [], failed: true }); });
    return () => { live = false; };
  }, [recordId]);
  return state;
}
