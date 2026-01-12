import "dotenv/config";
import { app } from "./app";
import { config } from "./config";

const PORT = config.PORT;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${PORT}`);
});
