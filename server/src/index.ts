import express from "express";
import cors from "cors";
import { lookupStudentName } from "./scraper";

const app = express();
app.use(cors());
app.use(express.json());

// Small concurrency limiter: up to MAX_CONCURRENT lookups in flight at once.
// This is still bounded (not unlimited parallel requests) — it's meant for
// looking up a list of known student numbers you've supplied, not for
// maximizing throughput against guessed/generated credentials.
const MAX_CONCURRENT = 3;
let activeCount = 0;

app.post("/api/lookup", async (req, res) => {
  const { studentNumber } = req.body ?? {};

  if (typeof studentNumber !== "string" || !studentNumber.trim()) {
    return res.status(400).json({ success: false, name: null, message: "studentNumber is required." });
  }

  if (activeCount >= MAX_CONCURRENT) {
    return res.status(429).json({
      success: false,
      name: null,
      message: `Too many lookups in flight (max ${MAX_CONCURRENT}). Please wait.`,
    });
  }

  activeCount++;
  try {
    const result = await lookupStudentName(studentNumber.trim());
    res.json(result);
  } finally {
    activeCount--;
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});