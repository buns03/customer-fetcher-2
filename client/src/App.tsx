import { useState, FormEvent } from "react";

interface LookupResult {
  success: boolean;
  name: string | null;
  message: string;
}

interface RowResult {
  studentNumber: string;
  status: "pending" | "running" | "done";
  result: LookupResult | null;
}

function parseStudentNumbers(raw: string): string[] {
  // One per line (or comma-separated), de-duplicated, blanks dropped.
  const items = raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(items));
}

export default function App() {
  const [rawInput, setRawInput] = useState("");
  const [rows, setRows] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numbers = parseStudentNumbers(rawInput);
    if (numbers.length === 0 || running) return;

    setRunning(true);
    const initialRows: RowResult[] = numbers.map((n) => ({
      studentNumber: n,
      status: "pending",
      result: null,
    }));
    setRows(initialRows);

    // Limited concurrency (matches the server's MAX_CONCURRENT) — a few
    // lookups run at once instead of strictly one-at-a-time, but this still
    // only ever looks up numbers you explicitly provided, never a range.
    const CONCURRENCY = 3;
    let nextIndex = 0;

    async function runOne(i: number) {
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "running" } : r)));

      let result: LookupResult;
      try {
        const res = await fetch("/api/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentNumber: numbers[i] }),
        });
        result = await res.json();
      } catch (err) {
        result = {
          success: false,
          name: null,
          message: err instanceof Error ? err.message : "Request failed.",
        };
      }

      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "done", result } : r)));
    }

    async function worker() {
      while (nextIndex < numbers.length) {
        const i = nextIndex++;
        await runOne(i);
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, numbers.length) }, () => worker()));

    setRunning(false);
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Canvas Student Lookup</h1>
        <p style={styles.subtitle}>
          Enter known student numbers, one per line. Each is looked up one at a
          time (used as both username and password).
        </p>

        <form onSubmit={handleSubmit}>
          <textarea
            style={styles.textarea}
            placeholder={"43560100\n43560234\n43561187"}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            disabled={running}
            rows={6}
          />
          <button
            style={{ ...styles.button, width: "100%", marginTop: 10 }}
            type="submit"
            disabled={running || !rawInput.trim()}
          >
            {running ? "Running..." : "Look up all"}
          </button>
        </form>

        {rows.length > 0 && (
          <div style={styles.resultsList}>
            {rows.map((row) => (
              <div
                key={row.studentNumber}
                style={{
                  ...styles.resultRow,
                  borderColor:
                    row.status !== "done"
                      ? "#ccc"
                      : row.result?.success && row.result.name
                      ? "#2e7d32"
                      : "#b3261e",
                }}
              >
                <div style={styles.resultRowNumber}>{row.studentNumber}</div>
                <div style={styles.resultRowValue}>
                  {row.status === "pending" && "waiting..."}
                  {row.status === "running" && "looking up..."}
                  {row.status === "done" &&
                    (row.result?.success && row.result.name
                      ? row.result.name
                      : row.result?.message ?? "No result")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f5f5f7",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: {
    width: 380,
    background: "#fff",
    borderRadius: 12,
    padding: 28,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  title: { margin: 0, fontSize: 20, fontWeight: 600 },
  subtitle: { marginTop: 6, marginBottom: 20, fontSize: 13, color: "#666" },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ccc",
    fontSize: 14,
    fontFamily: "monospace",
    resize: "vertical",
    boxSizing: "border-box",
  },
  button: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: "#111",
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
  },
  resultsList: {
    marginTop: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 360,
    overflowY: "auto",
  },
  resultRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1.5px solid",
    fontSize: 14,
  },
  resultRowNumber: { fontFamily: "monospace", color: "#444" },
  resultRowValue: { fontWeight: 600, textAlign: "right" },
};