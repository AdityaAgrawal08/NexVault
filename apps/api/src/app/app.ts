import express from "express";
import path from "path";
import routes from "./routes";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "../shared/middleware/error.middleware";
import { rateLimiter } from "../shared/middleware/rate-limiter.middleware";
import { ipBlacklistMiddleware } from "../shared/middleware/ip-blacklist.middleware";
import { metricsService } from "../core/monitoring/metrics.service";

export const app = express();

app.use(
  cors({
    origin: ["http://localhost:3001", "http://localhost:5173", "http://localhost:3000", "https://NexVault.shooterdelta.tech"],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

// 1. Global IP Blacklist Middleware
app.use(ipBlacklistMiddleware);

// 2. Global Rate Limiter: 200 requests per minute per IP
app.use(rateLimiter(60000, 200));

// 3. Prometheus Metrics Endpoint
app.get("/metrics", async (req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  const metrics = await metricsService.getMetricsText();
  res.end(metrics);
});

app.use("/api", routes);

if (process.env["NODE_ENV"] === "production") {
  const distPath = path.join(__dirname, "../../../web/dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use(errorMiddleware);
