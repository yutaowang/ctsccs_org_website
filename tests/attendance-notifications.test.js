import assert from "node:assert/strict";
import test from "node:test";
import { chineseDate, messageFor, validDate } from "../lib/attendance-notifications.js";

test("attendance notification validates real calendar dates", () => {
  assert.equal(validDate("2026-10-25"), "2026-10-25");
  assert.equal(validDate("2026-02-29"), "");
  assert.equal(validDate("2024-02-29"), "2024-02-29");
  assert.equal(validDate("10/25/2026"), "");
});

test("attendance notification uses the requested Chinese copy", () => {
  assert.equal(chineseDate("2026-10-25"), "2026年10月25日");
  const message = messageFor({ classDate: "2026-10-25", courseName: "中文一年级" });
  assert.equal(message.subject, "尊敬的家长，您小孩今天缺席中文一年级课程，提请注意");
  assert.equal(message.text, [
    "尊敬的家长，您小孩今天2026年10月25日，缺席中文一年级课程，被老师标记为 Absent。如果您知晓此事，请忽略此邮件；如果您确认您小孩今天来了学校，请联系 SCCS 管理团队：https://ctsccs.org/administration",
    "谢谢您的配合。",
    "SCCS 管理团队",
    "https://ctsccs.org/administration",
  ].join("\n"));
  assert.match(message.html, /href="https:\/\/ctsccs\.org\/administration"/);
});
