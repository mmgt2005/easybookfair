"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  getAuthorMessages,
  markMessagesRead,
  sendAuthorMessage,
  type AuthorMessage,
} from "@/app/admin/authors/messagesActions";
import { Button } from "@/components/ui";

const POLL_MS = 4000;

// Mirrors SalesFeedClient's exact polling shape (the established pattern
// in this app, chosen over Supabase Realtime for this app's actual
// message volume) — shared by both sides of the thread, parameterized by
// which side is viewing so each renders "mine" vs. "theirs" correctly and
// marks the right messages read.
export function AuthorMessagesClient({
  authorUserId,
  viewerRole,
  initialMessages,
}: {
  authorUserId: string;
  viewerRole: "author" | "admin";
  initialMessages: AuthorMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const seenCount = useRef(initialMessages.length);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markMessagesRead(authorUserId).catch(() => {});
  }, [authorUserId]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.hidden) return;
      try {
        const fresh = await getAuthorMessages(authorUserId);
        if (cancelled) return;
        if (fresh.length !== seenCount.current) {
          const hasNewFromOtherSide = fresh
            .slice(seenCount.current)
            .some((m) => m.sender_role !== viewerRole);
          seenCount.current = fresh.length;
          setMessages(fresh);
          if (hasNewFromOtherSide) {
            markMessagesRead(authorUserId).catch(() => {});
          }
        }
      } catch {
        // Transient poll failure — same posture as SalesFeedClient, just
        // try again next tick.
      }
    }

    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authorUserId, viewerRole]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function handleSend() {
    const body = draft.trim();
    if (!body) return;
    const formData = new FormData();
    formData.set("body", body);
    setDraft("");
    startTransition(async () => {
      await sendAuthorMessage(authorUserId, formData);
      const fresh = await getAuthorMessages(authorUserId);
      seenCount.current = fresh.length;
      setMessages(fresh);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={listRef}
        className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-xl border-2 border-neutral-100 bg-neutral-50 p-3"
      >
        {messages.map((m) => {
          const isMine = m.sender_role === viewerRole;
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                  isMine ? "bg-accent-100 text-accent-900" : "bg-white text-neutral-800"
                }`}
              >
                <p className="whitespace-pre-line">{m.body}</p>
                <p className="mt-1 text-[11px] text-neutral-400">
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">No messages yet — say hello.</p>
        )}
      </div>
      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          placeholder="Type a message…"
          className="w-full flex-1 rounded-xl border-2 border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100"
        />
        <Button type="button" size="sm" disabled={isPending} onClick={handleSend}>
          Send
        </Button>
      </div>
    </div>
  );
}
