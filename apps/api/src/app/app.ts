import express from "express";
import routes from "./routes";
import cors from "cors"; //Cross-Origin Resource Sharing
import cookieParser from "cookie-parser";
import { errorMiddleware } from "../shared/middleware/error.middleware";

export const app = express();

app.use(cors());
app.use(cookieParser());
app.use(express.json());
// Why use express.json because without it : { username: "user"} arrives as undefined and with it req.body.username works

app.use(routes);
app.use(errorMiddleware);
