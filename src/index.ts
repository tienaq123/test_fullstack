import { app } from "./app";

const PORT = 3000;

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
app.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`Server running at http://localhost:${PORT}`);
});
