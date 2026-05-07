import "dotenv/config";
import app from "./app.js";
import prisma from "./config/prisma.js";

const PORT = process.env.PORT || 3000;

// --- Verify DB Connection on Startup ---
prisma
  .$connect()
  .then(() => {
    console.log(`[fs-knbn] ✅ Database connected successfully. \n Especially ${process.env.DATABASE_URL}`);

    app.listen(PORT, () => {
      console.log(`[fs-knbn] Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[fs-knbn] ❌ Database connection failed:", err.message);
    process.exit(1);
  });