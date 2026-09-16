"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { PendingButton } from "@/components/pending-button";
import type { Role } from "@/lib/types";

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path fillRule="evenodd" d="M2 5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H3Z" clipRule="evenodd" />
    </svg>
  );
}

export function NavBar({
  role,
  personId,
  pendingCount,
  pendingAccessRequestCount,
  openSuggestionCount,
}: {
  role: Role;
  personId: string | null;
  pendingCount: number;
  pendingAccessRequestCount: number;
  openSuggestionCount: number;
}) {
  const isAdmin = role === "admin" || role === "super_admin";
  const badgeCount = pendingCount + pendingAccessRequestCount + openSuggestionCount;
  const pathname = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, [pathname]);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-slate-900">
          Nams Family Tree
        </Link>
        <nav className="ml-auto flex items-center gap-4 text-sm font-medium text-slate-600">
          {personId && (
            <Link href={`/people/${personId}`} className="hover:text-slate-900">
              Me
            </Link>
          )}
          <Link href="/tree" className="hover:text-slate-900">
            Tree
          </Link>
          <Link href="/compare" className="hover:text-slate-900">
            Compare
          </Link>
          <Link href="/tree" aria-label="Search for a person" className="hover:text-slate-900">
            <SearchIcon />
          </Link>

          <details ref={menuRef} className="group relative">
            <summary
              className="relative flex cursor-pointer list-none items-center hover:text-slate-900 [&::-webkit-details-marker]:hidden"
              aria-label="Menu"
            >
              <MenuIcon />
              {badgeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                  {badgeCount}
                </span>
              )}
            </summary>
            <div
              onClick={() => {
                if (menuRef.current) menuRef.current.open = false;
              }}
              className="absolute right-0 z-10 mt-2 w-60 rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            >
              <Link href="/groups" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                Groups
              </Link>
              <Link href="/add-family-member" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                Add a Family Member
              </Link>
              <Link href="/my-submissions" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                My Submissions
              </Link>
              <Link href="/quick-edit" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                Quick Edit
              </Link>
              <Link
                href="/suggestions"
                className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 hover:text-slate-900"
              >
                Suggestions
                {isAdmin && openSuggestionCount > 0 && (
                  <span className="rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                    {openSuggestionCount}
                  </span>
                )}
              </Link>
              <Link href="/install" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                Install App
              </Link>
              {personId && (
                <Link href="/privacy" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                  My Privacy Settings
                </Link>
              )}
              <Link href="/faq" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                FAQ
              </Link>
              <Link href="/about" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                About This Family Tree
              </Link>

              {isAdmin && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <div className="px-3 py-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">Admin</div>
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
                  <Link href="/admin/invites/new" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                    Invite Someone New
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
                  <Link href="/admin/activity-log" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                    Activity Log
                  </Link>
                  <Link
                    href="/admin/privacy-defaults"
                    className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900"
                  >
                    Privacy Defaults
                  </Link>
                  <Link href="/admin/export" className="block px-3 py-2 hover:bg-slate-50 hover:text-slate-900">
                    Data Export
                  </Link>
                </>
              )}

              <div className="my-1 border-t border-slate-100" />
              <form action={signOut}>
                <PendingButton
                  className="block w-full px-3 py-2 text-left hover:bg-slate-50 hover:text-slate-900"
                  pendingChildren="Signing out…"
                >
                  Sign out
                </PendingButton>
              </form>
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}
