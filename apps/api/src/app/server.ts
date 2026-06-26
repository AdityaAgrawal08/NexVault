import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";

const port = Number(process.env.PORT);

if (!Number.isInteger(port)) {
  throw new Error("Port must be a valid integer.");
}

app.listen(port, () => {
  console.log(`Server running on ${port}`);
});

