// Poll the open batch until it ends. Batches finish in anywhere from a minute to
// the better part of an hour, so this exits on completion rather than on a timer.
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();
const id = fs.readFileSync("data/.axes-batch-id", "utf8").trim();
for (;;) {
  const b = await client.messages.batches.retrieve(id);
  const c = b.request_counts;
  if (b.processing_status === "ended") {
    console.log(`BATCH ENDED: succeeded ${c.succeeded}, errored ${c.errored}, expired ${c.expired}, canceled ${c.canceled}`);
    break;
  }
  console.log(`still ${b.processing_status}: processing ${c.processing}, succeeded ${c.succeeded}, errored ${c.errored}`);
  await new Promise((r) => setTimeout(r, 45000));
}
