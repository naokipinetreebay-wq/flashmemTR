import { WebSocket } from "ws";
import { buildSlots, dealValues, samePlace } from "../src/lib/deal";
import { placementsFor } from "../src/lib/placement";
import { Room, type ClientSocket } from "../src/server/room";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function fakeSocket(): ClientSocket {
  return { readyState: WebSocket.OPEN, send() {} } as unknown as ClientSocket;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const clocks: Record<number, string[]> = {
  2: ["9時", "3時"],
  3: ["10時", "2時", "6時"],
  4: ["10時", "8時", "4時", "2時"],
};
for (const [count, expected] of Object.entries(clocks)) {
  assert(placementsFor(Number(count)).map((slot) => slot.clock).join(",") === expected.join(","), `${count} clocks`);
}

for (let trial = 0; trial < 20; trial++) {
  const easy = dealValues(6, "easy", Math.random).sort((a, b) => a - b);
  assert(easy.join(",") === "1,2,3,4,5,6", "easy mode is consecutive");
  const hard = dealValues(6, "hard", Math.random);
  assert(new Set(hard).size === hard.length, "hard numbers do not repeat");
  assert(hard.some((value) => value >= 10), "hard mode includes a two-digit number");
  assert(hard.every((value) => value >= 0 && value <= 99), "hard numbers stay within 0-99");
}

const slots = buildSlots(["a", "b"], true, true);
assert(slots.length === 6, "center plus two phones, split, is six numbers");
assert(slots.filter((slot) => slot.id === "center").length === 2, "center is split too");
assert(buildSlots(["a", "b"], false, false).every((slot) => slot.half == null), "single cell has no half");
assert(samePlace({ id: "a", half: "left" }, "a", "left"), "matching half");
assert(!samePlace({ id: "a", half: "left" }, "a", "right"), "the other half misses");

async function play() {
  const room = new Room("TEST01");
  try {
    room.addDisplay(fakeSocket(), "a");
    room.addController(fakeSocket());
    room.start();
    assert(room.snapshot().phase === "idle", "two peripherals are required");
    room.addDisplay(fakeSocket(), "b");
    room.updateConfig({ level: "easy", flashSeconds: 0.1, centerNumber: false, split: false });
    room.start();
    assert(room.snapshot().phase === "flash", "flash starts");
    assert(room.snapshot().slots.every((slot) => slot.value != null), "numbers are visible during the flash");
    assert(room.secretSlots().every((slot) => slot.id !== "center"), "center stays blank when that option is off");
    await sleep(180);
    assert(room.snapshot().phase === "answer", "answering starts after the flash");
    assert(room.snapshot().slots.every((slot) => slot.value == null), "answers stay hidden");
    assert(room.snapshot().prompt != null, "the controller shows one number");
    const wrong = room.secretCurrent();
    room.tap("center", null);
    assert(room.snapshot().correct === 0, "tapping the center misses when it had no number");
    assert(room.secretSlots().find((slot) => slot.value === wrong?.value)?.correct === false, "that number is marked wrong");

    const splitRoom = new Room("TEST02");
    try {
      splitRoom.addController(fakeSocket());
      splitRoom.addDisplay(fakeSocket(), "a");
      splitRoom.addDisplay(fakeSocket(), "b");
      splitRoom.updateConfig({ level: "hard", flashSeconds: 0.1, centerNumber: true, split: true });
      splitRoom.start();
      await sleep(180);
      const current = splitRoom.secretCurrent();
      assert(current?.half === "left" || current?.half === "right", "split answers have a side");
      const other = current?.half === "left" ? "right" : "left";
      splitRoom.tap(current!.id, other);
      assert(splitRoom.snapshot().correct === 0, "the other half is wrong");
      await sleep(150);
      while (splitRoom.snapshot().phase === "answer") {
        const key = splitRoom.secretCurrent();
        assert(key, "a prompt exists");
        splitRoom.tap(key!.id, key!.half);
        await sleep(150);
      }
      const done = splitRoom.snapshot();
      assert(done.phase === "review", "review after every number");
      assert(done.correct === done.questionTotal - 1, "one miss and the rest correct");
      assert(done.slots.every((slot) => slot.value != null), "review shows the numbers again");
      const values = splitRoom.secretSlots().map((slot) => slot.value);
      assert(new Set(values).size === values.length, "split hard mode stays unique");
      assert(values.some((value) => value >= 10), "split hard mode includes two digits");
    } finally {
      splitRoom.destroy();
    }

    for (const extra of ["c", "d", "e", "f"]) room.addDisplay(fakeSocket(), extra);
    const rejected = room.addDisplay(fakeSocket(), "g");
    assert(!rejected.ok, "seventh peripheral is rejected");
  } finally {
    room.destroy();
  }
}

play()
  .then(() => console.log("flashmem rules ok"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
