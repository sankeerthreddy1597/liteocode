import { useCallback, useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { format } from "date-fns";
import { useNavigate } from "react-router";
import { useDialog } from "../../providers/dialog";
import { useToast } from "../../providers/toast";
import { listSessions, type SessionSummary } from "../../lib/sessions";
import { DialogSearchList } from "../dialog-search-list";

export const SessionsDialogContent = () => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { close } = useDialog();
  const navigate = useNavigate();
  const { show } = useToast();

  useEffect(() => {
    let ignore = false;

    listSessions()
      .then((data) => {
        if (!ignore) {
          setSessions(data);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!ignore) {
          show({
            variant: "error",
            message: error instanceof Error ? error.message : "Failed to load sessions",
          });
          close();
        }
      });

    return () => {
      ignore = true;
    };
  }, [close, show]);

  const handleSelect = useCallback(
    (session: SessionSummary) => {
      close();
      navigate(`/sessions/${session.id}`);
    },
    [close, navigate],
  );

  if (loading) {
    return (
      <box flexDirection="column">
        <text attributes={TextAttributes.DIM}>Loading sessions...</text>
      </box>
    );
  }

  return (
    <DialogSearchList
      items={sessions}
      onSelect={handleSelect}
      filterFn={(s, query) => s.title.toLowerCase().includes(query.toLowerCase())}
      renderItem={(session, isSelected) => (
        <>
          <text selectable={false} fg={isSelected ? "black" : "white"}>
            {session.title}
          </text>
          <box flexGrow={1} />
          <text
            selectable={false}
            fg={isSelected ? "black" : undefined}
            attributes={TextAttributes.DIM}
          >
            {format(new Date(session.createdAt), "hh:mm a")}
          </text>
        </>
      )}
      getKey={(s) => s.id}
      placeholder="Search sessions"
      emptyText="No matching sessions"
    />
  );
};
