import test from "node:test";
import assert from "node:assert/strict";
import { assetCandidates, assetName } from "../scripts/utils.js";

test("asset candidates recover paths with encoded leading spaces", () => {
  const path="3_F00L/Other/Project/WinScreen/%20(10).png";
  const candidates=assetCandidates(path);
  assert.equal(candidates[0],path);
  assert.ok(candidates.includes("3_F00L/Other/Project/WinScreen/ (10).png"));
  assert.ok(candidates.includes("3_F00L/Other/Project/WinScreen/(10).png"));
  assert.equal(assetName(path),"(10).png");
});

test("asset candidates do not duplicate ordinary paths", () => {
  assert.deepEqual(assetCandidates("folder/image.png"),["folder/image.png"]);
});
