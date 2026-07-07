"use client";

import { useState, useTransition } from "react";
import {
  adminHideWikiDiscussion,
  adminRestoreWikiRevision,
  adminSetWikiHidden,
  adminSetWikiProtected,
} from "@/actions/wiki";

type Action = () => Promise<{ ok: boolean; error?: string; message?: string }>;

function SmallActionButton({
  label,
  action,
}: {
  label: string;
  action: Action;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await action();
            setMessage(result.ok ? result.message ?? "Done" : result.error ?? "Failed");
          });
        }}
        className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-cream/60 hover:border-osc-blue/60 hover:text-osc-blue disabled:opacity-50"
      >
        {pending ? "..." : label}
      </button>
      {message ? <span className="text-[11px] text-cream/40">{message}</span> : null}
    </span>
  );
}

export function WikiPageAdminActions({
  pageId,
  isHidden,
  isProtected,
}: {
  pageId: string;
  isHidden: boolean;
  isProtected: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <SmallActionButton
        label={isHidden ? "Unhide" : "Hide"}
        action={() => adminSetWikiHidden(pageId, !isHidden)}
      />
      <SmallActionButton
        label={isProtected ? "Unprotect" : "Protect"}
        action={() => adminSetWikiProtected(pageId, !isProtected)}
      />
    </div>
  );
}

export function WikiDiscussionAdminAction({
  discussionId,
  isHidden,
}: {
  discussionId: string;
  isHidden: boolean;
}) {
  return (
    <SmallActionButton
      label={isHidden ? "Unhide" : "Hide"}
      action={() => adminHideWikiDiscussion(discussionId, !isHidden)}
    />
  );
}

export function WikiRevisionRestoreButton({ revisionId }: { revisionId: string }) {
  return (
    <SmallActionButton
      label="Restore"
      action={() => adminRestoreWikiRevision(revisionId)}
    />
  );
}
