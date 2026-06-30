import express from "express";
import routes from "./routes";
import cors from "cors"; //Cross-Origin Resource Sharing
import cookieParser from "cookie-parser";
import { errorMiddleware } from "../shared/middleware/error.middleware";
import { rateLimiter } from "../shared/middleware/rate-limiter.middleware";

export const app = express();

app.use(
  cors({
    origin: ["http://localhost:3001", "http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

// Global Rate Limiter: 200 requests per minute per IP
app.use(rateLimiter(60000, 200));
// Why use express.json because without it : { username: "user"} arrives as undefined and with it req.body.username works

app.use(routes);
app.use(errorMiddleware);
