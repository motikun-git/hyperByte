import { useState } from "react";
import { dateTime } from "../../lib/format.js";
import { Empty, LoadError, PageHead, Pager, useAdminApi, useDocTitle } from "../ui.jsx";

export default function Activity() {
  useDocTitle("Activity log");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAdminApi(`/admin/activity${page > 1 ? `?page=${page}` : ""}`);
  return (
    <>
      <PageHead title="Activity log" sub="Logins and every change made in the admin panel, newest first." />
      {error && !data ? (
        <LoadError error={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : data?.items?.length ? (
        <section className="a-card" style={{ opacity: loading ? 0.6 : 1 }}>
          {data.items.map((item) => (
            <div key={item.id} className="a-log">
              <span className="a-log__time">{dateTime(item.createdAt)}</span>
              <span>
                {item.summary}
                <span className="a-log__who">
                  {" "}
                  · {item.adminName || "system"}
                  {item.ip ? ` · ${item.ip}` : ""}
                </span>
              </span>
            </div>
          ))}
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </section>
      ) : (
        <Empty icon="history" title="Nothing logged yet" />
      )}
    </>
  );
}
