import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAdminUsers } from "../api/queries";
import type { AdminUserFilters } from "../api/queries";
import AdminHeader from "../components/AdminHeader";
import EmptyState from "../components/EmptyState";
import { Loading, LoadError } from "../components/LoadState";
import { ArrowLeftIcon, SearchIcon, UsersIcon } from "../components/icons";
import { STAGE_LABELS } from "../state/caseLabels";
import { formatDateTime } from "../utils/format";
import { routes } from "../routes";
import type { AdminUser } from "../api/types";

export function RoleChip({ user }: { user: Pick<AdminUser, "role" | "isStaff"> }) {
  return (
    <span className={`chip chip-${user.role === "reviewer" ? "info" : "neutral"}`}>
      {user.role === "reviewer" ? (user.isStaff ? "Reviewer · staff" : "Reviewer") : "Applicant"}
    </span>
  );
}

export function StatusChip({ active }: { active: boolean }) {
  return <span className={`chip chip-${active ? "low" : "critical"}`}>{active ? "Active" : "Deactivated"}</span>;
}

const NO_FILTERS: AdminUserFilters = { search: "", role: "", status: "" };

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AdminUserFilters>(NO_FILTERS);
  // The search is sent once typing pauses, not on every key.
  const [typed, setTyped] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((f) => (f.search === typed ? f : { ...f, search: typed })), 300);
    return () => window.clearTimeout(timer);
  }, [typed]);
  const list = useAdminUsers(filters);

  if (list.isPending) return <Loading />;
  if (list.isError && !list.data) return <LoadError error={list.error} onRetry={() => list.refetch()} />;
  const rows = list.data.pages.flatMap((p) => p.results);
  const total = list.data.pages[0]?.total ?? rows.length;
  const filtered = filters.search !== "" || filters.role !== "" || filters.status !== "";

  return (
    <div className="page">
      <AdminHeader active="users" sub="Every account, newest first. Select one to see its assessments and activity." />

      <div className="admin-filters" role="search">
        <div className="admin-search">
          <SearchIcon size={15} />
          <label className="sr-only" htmlFor="admin-search">
            Search by email
          </label>
          <input
            id="admin-search"
            className="input"
            type="search"
            placeholder="Search by email"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </div>
        <label className="sr-only" htmlFor="admin-role">
          Role
        </label>
        <select
          id="admin-role"
          className="input"
          value={filters.role}
          onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value as AdminUserFilters["role"] }))}
        >
          <option value="">All roles</option>
          <option value="applicant">Applicants</option>
          <option value="reviewer">Reviewers</option>
        </select>
        <label className="sr-only" htmlFor="admin-status">
          Status
        </label>
        <select
          id="admin-status"
          className="input"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as AdminUserFilters["status"] }))}
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </select>
      </div>

      <p className="admin-count" aria-live="polite">
        {total} user{total === 1 ? "" : "s"}
        {filtered ? " match" : ""}
        {list.isFetching && !list.isFetchingNextPage ? " · updating…" : ""}
      </p>

      {rows.length === 0 ? (
        <EmptyState icon={<UsersIcon size={22} />} title={filtered ? "No users match" : "No users yet"}>
          {filtered ? "Try another search, or clear the role and status filters." : "Accounts appear here once someone signs in."}
        </EmptyState>
      ) : (
        <div className="card admin-table-card">
          <div className="table-wrap">
            <table className="data-table admin-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col" className="num">
                    Assessments
                  </th>
                  <th scope="col">Latest stage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} onClick={() => navigate(routes.reviewerAdminUser(u.id))}>
                    <td className="admin-email">
                      <Link to={routes.reviewerAdminUser(u.id)} onClick={(e) => e.stopPropagation()}>
                        {u.email}
                      </Link>
                    </td>
                    <td>
                      <RoleChip user={u} />
                    </td>
                    <td>
                      <StatusChip active={u.isActive} />
                    </td>
                    <td>{formatDateTime(u.joinedAt)}</td>
                    <td>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="admin-muted">Never</span>}</td>
                    <td className="num">{u.assessmentCount}</td>
                    <td>
                      {u.latestStage ? (
                        <span className={`chip chip-${STAGE_LABELS[u.latestStage].tone}`}>
                          {STAGE_LABELS[u.latestStage].reviewer}
                        </span>
                      ) : (
                        <span className="admin-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {list.hasNextPage && (
        <div className="queue-more">
          <button className="btn btn-ghost" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
            {list.isFetchingNextPage ? "Loading…" : "Show more"}
          </button>
        </div>
      )}

      <footer className="actionbar">
        <button className="btn btn-ghost" onClick={() => navigate(routes.reviewer())}>
          <ArrowLeftIcon size={15} />
          Back to the queue
        </button>
      </footer>
    </div>
  );
}
