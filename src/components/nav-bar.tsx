"use client";

import { useRef } from "react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { PendingButton } from "@/components/pending-button";
import type { Role } from "@/lib/types";

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M8.34 1.8a1.5 1.5 0 0 1 1.32-.8h.68a1.5 1.5 0 0 1 1.32.8l.44.86a6.5 6.5 0 0 1 1.2.7l.94-.28a1.5 1.5 0 0 1 1.62.62l.34.58a1.5 1.5 0 0 1-.2 1.72l-.66.74a6.5 6.5 0 0 1 0 1.4l.66.74a1.5 1.5 0 0 1 .2 1.72l-.34.58a1.5 1.5 0 0 1-1.62.62l-.94-.28a6.5 6.5 0 0 1-1.2.7l-.44.86a1.5 1.5 0 0 1-1.32.8h-.68a1.5 1.5 0 0 1-1.32-.8l-.44-.86a6.5 6.5 0 0 1-1.2-.7l-.94.28a1.5 1.5 0 0 1-1.62-.62l-.34-.58a1.5 1.5 0 0 1 .2-1.72l.66-.74a6.5 6.5 0 0 1 0-1.4l-.66-.74a1.5 1.5 0 0 1-.2-1.72l.34-.58a1.5 1.5 0 0 1 1.62-.62l.94.28a6.5 6.5 0 0 1 1.2-.7l.44-.86ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function NavBar({
  role,
  pendingCount,
  pendingAccessRequestCount,
}: {
  role: Role;
  pendingCount: number;
  pendingAccessRequestCount: number;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);
  const adminRef = useRef<HTMLDetailsElement>(null);
  const isAdmin = role === "admin" || role === "super_admin";

  function closeMenuOnNavClick(e: React.MouseEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest("summary")) return;
    if (moreRef.current) moreRef.current.open = false;
    if (adminRef.current) adminRef.current.open = false;
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-slate-900">
          Nams Family Tree
        </Link>
        <nav
          onClick={closeMenuOnNavClick}
          className="flex items-center gap-4 text-sm font-medium text-slate-600"
        >
          <Link href="/" className="hover:text-slate-900">
            Tree
          </Link>
          <Link href="/groups" className="hover:text-slate-900">
            Groups
          </Link>

          <details
            ref={moreRef}
            className="relative"
            onToggle={() => {
              if (moreRef.current?.open && adminRef.current) adminRef.current.open = false;
            }}
          >
            <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
              More
              <ChevronIcon />
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              <Link href="/my-submissions" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                My Submissions
              </Link>
              <Link href="/install" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                Install App
              </Link>
            </div>
          </details>

          {isAdmin && (
            <details
              ref={adminRef}
              className="relative"
              onToggle={() => {
                if (adminRef.current?.open && moreRef.current) moreRef.current.open = false;
              }}
            >
              <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
                <GearIcon />
                Admin
                {pendingCount + pendingAccessRequestCount > 0 && (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
                    {pendingCount + pendingAccessRequestCount}
                  </span>
                )}
              </summary>
              <div className="absolute right-0 z-10 mt-2 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <Link
                  href="/admin/pending"
                  className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 hover:text-slate-900"
                >
                  Pending Approvals
                  {pendingCount > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                      {pendingCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/admin/access-requests"
                  className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 hover:text-slate-900"
                >
                  Access Requests
                  {pendingAccessRequestCount > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                      {pendingAccessRequestCount}
                    </span>
                  )}
                </Link>
                <Link href="/admin/invites" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                  Invite Management
                </Link>
                <Link href="/admin/people" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                  People Management
                </Link>
                <Link href="/admin/audit-log" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                  Audit Log
                </Link>
                <Link href="/admin/login-log" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                  Login Log
                </Link>
                <Link href="/admin/privacy-defaults" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                  Privacy Defaults
                </Link>
                <Link href="/admin/export" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                  Data Export
                </Link>
              </div>
            </details>
          )}
          <form action={signOut}>
            <PendingButton className="hover:text-slate-900" pendingChildren="Signing out…">
              Sign out
            </PendingButton>
          </form>
        </nav>
      </div>
    </header>
  );
}
