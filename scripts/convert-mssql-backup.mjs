import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const [sourceArg, outputArg = "supabase/seed/legacy_data_20260615.sql"] = process.argv.slice(2);

if (!sourceArg) {
  console.error("Usage: node scripts/convert-mssql-backup.mjs <source.sql> [output.sql]");
  process.exit(1);
}

const source = path.resolve(sourceArg);
const output = path.resolve(outputArg);
fs.mkdirSync(path.dirname(output), { recursive: true });
const bom = Buffer.alloc(2);
const sourceHandle = fs.openSync(source, "r");
fs.readSync(sourceHandle, bom, 0, 2, 0);
fs.closeSync(sourceHandle);
const sourceEncoding = bom[0] === 0xff && bom[1] === 0xfe ? "utf16le" : "utf8";

const tableMap = {
  CLASS_TIME: {
    target: "sccs.class_times",
    columns: {
      ClassTimeId: ["id", "legacy_class_time_id"],
      Time: ["display_time"],
      Notes: ["notes"],
    },
  },
  TEACHER_CONTACT: {
    target: "sccs.teachers",
    columns: {
      TeacherId: ["id", "legacy_teacher_id"],
      TeacherShortName: ["short_name"],
      TeacherFirstName: ["first_name"],
      TeacherLastName: ["last_name"],
      TeacherEmail1: ["email_1"],
      TeacherPhone1: ["phone_1"],
      TeacherEmail2: ["email_2"],
      TeacherPhone2: ["phone_2"],
    },
  },
  CLASS: {
    target: "sccs.classes",
    columns: {
      ClassId: ["id", "legacy_class_id"],
      ClassShortName: ["short_name"],
      ClassName: ["name"],
      Maximum: ["maximum"],
      ClassTimeId: ["class_time_id"],
      Type: ["type"],
      Donation: ["donation"],
      Classroom: ["classroom"],
      TeacherShortName: ["teacher_short_name"],
      isOpen: ["is_open"],
      Equivalent: ["equivalent"],
      textbook: ["textbook"],
    },
    booleans: new Set(["isOpen"]),
  },
  FAMILY: {
    target: "sccs.families",
    columns: {
      FamilyId: ["id", "legacy_family_id"],
      FamilyName: ["family_name", "email"],
      ParentFirstName: ["parent_first_name"],
      ParentLastName: ["parent_last_name"],
      Address: ["address"],
      City: ["city"],
      State: ["state"],
      Zip: ["zip"],
      Phone: ["phone"],
      CreateDate: ["created_at", "updated_at"],
      CreateIp: ["legacy_create_ip"],
      ParentChineseName: ["parent_chinese_name"],
      wechat: ["wechat"],
    },
    ignored: new Set(["Mima"]),
  },
  STUDENT: {
    target: "sccs.students",
    columns: {
      StudentId: ["id", "legacy_student_id"],
      FamilyId: ["family_id", "legacy_family_id"],
      FirstName: ["first_name"],
      LastName: ["last_name"],
      Gender: ["gender"],
      BirthYear: ["birth_year"],
      CreateDate: ["created_at", "updated_at"],
      CreateIp: ["legacy_create_ip"],
      ChineseName: ["chinese_name"],
    },
  },
  CLASS_REG_INFO: {
    target: "sccs.class_registrations",
    columns: {
      Id: ["id", "legacy_class_registration_id"],
      StudentId: ["student_id", "legacy_student_id"],
      Session1: ["session_1", "legacy_session_1"],
      Session2: ["session_2", "legacy_session_2"],
      Session3: ["session_3", "legacy_session_3"],
      RegDate: ["registered_at"],
      RegIP: ["registration_ip"],
    },
  },
  FAMILY_REGISTRATION: {
    target: "sccs.family_registrations",
    columns: familyRegistrationColumns(true),
    booleans: new Set(["HandbookAgreement", "MedicalRelease", "PhotoAgreement", "PfizerMatch"]),
  },
  family_reg_test: {
    target: "sccs.legacy_family_registration_test",
    columns: familyRegistrationColumns(false),
    booleans: new Set(["HandbookAgreement", "MedicalRelease", "PhotoAgreement", "PfizerMatch"]),
  },
};

function familyRegistrationColumns(includeLegacyId) {
  return {
    FamRegId: includeLegacyId ? ["id", "legacy_family_registration_id"] : ["id"],
    FamilyId: includeLegacyId ? ["family_id", "legacy_family_id"] : ["family_id"],
    HandbookAgreement: ["handbook_agreement"],
    MedicalRelease: ["medical_release"],
    PhotoAgreement: ["photo_agreement"],
    PfizerMatch: ["pfizer_match"],
    LateFee: ["late_fee"],
    RegFee: ["registration_fee"],
    CreateDate: ["created_at"],
    CreateIP: ["create_ip"],
    Pay1Cash: ["pay_1_cash"],
    Pay1Check: ["pay_1_check"],
    Pay1CheckNum: ["pay_1_check_number"],
    Pay1CheckName: ["pay_1_check_name"],
    Pay2Cash: ["pay_2_cash"],
    Pay2Check: ["pay_2_check"],
    Pay2CheckNum: ["pay_2_check_number"],
    Pay2CheckName: ["pay_2_check_name"],
    FormStatus: ["form_status"],
    Pay3Cash: ["pay_3_cash"],
    Pay3Check: ["pay_3_check"],
    Pay3Refund: ["pay_3_refund"],
    Pay3CheckNum: ["pay_3_check_number"],
    Pay3CheckName: ["pay_3_check_name"],
    Day3Refund: ["day_3_refund"],
    Day2Refund: ["day_2_refund"],
    Pay4Refund: ["pay_4_refund"],
    Pay4RefundNote: ["pay_4_refund_note"],
    Pay4Cash: ["pay_4_cash"],
    Pay4CheckNum: ["pay_4_check_number"],
    Pay4CheckName: ["pay_4_check_name"],
    Pay4Check: ["pay_4_check"],
    Pay5Cash: ["pay_5_cash"],
    Pay5Check: ["pay_5_check"],
    Pay5CheckNum: ["pay_5_check_number"],
    Pay5CheckName: ["pay_5_check_name"],
    Pay5Refund: ["pay_5_refund"],
    PfizerEmpName: ["pfizer_employee_name"],
    PfizerEmail: ["pfizer_email"],
    PatrolDeposit: ["patrol_deposit"],
    VolunteerName: ["volunteer_name"],
  };
}

function splitValues(input) {
  const values = [];
  let start = 0;
  let depth = 0;
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "'") {
      if (quoted && input[index + 1] === "'") {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === "(") {
      depth += 1;
    } else if (!quoted && char === ")") {
      depth -= 1;
    } else if (!quoted && depth === 0 && char === ",") {
      values.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(input.slice(start).trim());
  return values;
}

function parseValue(expression) {
  if (/^NULL$/i.test(expression)) return null;
  const cast = expression.match(/^CAST\(N?'((?:''|[^'])*)'\s+AS\s+DateTime\)$/i);
  if (cast) return cast[1].replaceAll("''", "'");
  const string = expression.match(/^N?'((?:''|[^'])*)'$/s);
  if (string) return string[1].replaceAll("''", "'");
  if (/^-?\d+(?:\.\d+)?$/.test(expression)) return Number(expression);
  throw new Error(`Unsupported SQL value: ${expression}`);
}

function sqlValue(value, boolean = false) {
  if (value === null || value === undefined || value === "") return value === "" ? "''" : "null";
  if (boolean) return Number(value) === 1 ? "true" : "false";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const counts = {};
const records = Object.fromEntries(Object.keys(tableMap).map((table) => [table, []]));
const outputStream = fs.createWriteStream(output, { encoding: "utf8" });
outputStream.write([
  "-- Generated from the SCCS SQL Server backup.",
  "-- Contains private family and student data. Do not commit this file.",
  "begin;",
  "",
].join("\n"));

const input = readline.createInterface({
  input: fs.createReadStream(source, { encoding: sourceEncoding }),
  crlfDelay: Infinity,
});

function insertIsComplete(statement) {
  const valuesIndex = statement.search(/\bVALUES\s*\(/i);
  if (valuesIndex < 0) return false;
  const openIndex = statement.indexOf("(", valuesIndex);
  let depth = 0;
  let quoted = false;
  for (let index = openIndex; index < statement.length; index += 1) {
    const char = statement[index];
    if (char === "'") {
      if (quoted && statement[index + 1] === "'") index += 1;
      else quoted = !quoted;
    } else if (!quoted && char === "(") depth += 1;
    else if (!quoted && char === ")") depth -= 1;
  }
  return !quoted && depth === 0;
}

function convertInsert(statement) {
  const match = statement.match(/^INSERT\s+(?:\[[^\]]+\]\.)?\[([^\]]+)\]\s+\((.*?)\)\s+VALUES\s+\((.*)\)\s*$/is);
  if (!match) throw new Error(`Could not parse INSERT: ${statement.slice(0, 160)}`);

  const [, sourceTable, columnText, valueText] = match;
  const mapping = tableMap[sourceTable];
  if (!mapping) return;

  const sourceColumns = [...columnText.matchAll(/\[([^\]]+)\]/g)].map((item) => item[1]);
  const sourceValues = splitValues(valueText).map(parseValue);
  if (sourceColumns.length !== sourceValues.length) {
    throw new Error(`${sourceTable}: ${sourceColumns.length} columns but ${sourceValues.length} values`);
  }

  const targetColumns = [];
  const targetValues = [];
  const booleanTargets = new Set();
  sourceColumns.forEach((column, index) => {
    if (mapping.ignored?.has(column)) return;
    const targets = mapping.columns[column];
    if (!targets) throw new Error(`${sourceTable}: no mapping for ${column}`);
    targets.forEach((target) => {
      targetColumns.push(target);
      targetValues.push(sourceValues[index]);
      if (mapping.booleans?.has(column)) booleanTargets.add(target);
    });
  });

  records[sourceTable].push({ mapping, targetColumns, targetValues, booleanTargets });
  counts[sourceTable] = (counts[sourceTable] || 0) + 1;
}

let statement = "";
for await (const line of input) {
  if (!statement) {
    if (!line.startsWith("INSERT ")) continue;
    statement = line;
  } else {
    statement += `\n${line}`;
  }

  if (insertIsComplete(statement)) {
    convertInsert(statement);
    statement = "";
  }
}
if (statement) throw new Error(`Incomplete INSERT at end of file: ${statement.slice(0, 160)}`);

function getValue(record, column) {
  return record.targetValues[record.targetColumns.indexOf(column)];
}

function setValue(record, column, value) {
  const index = record.targetColumns.indexOf(column);
  if (index >= 0) record.targetValues[index] = value;
}

const familyIds = new Set(records.FAMILY.map((record) => getValue(record, "id")));
const studentIds = new Set(records.STUDENT.map((record) => getValue(record, "id")));
const classIds = new Set(records.CLASS.map((record) => getValue(record, "id")));
const classTimeIds = new Set(records.CLASS_TIME.map((record) => getValue(record, "id")));

for (const record of records.CLASS) {
  const classTimeId = getValue(record, "class_time_id");
  if (classTimeId !== null && !classTimeIds.has(classTimeId)) setValue(record, "class_time_id", null);
}
for (const record of records.STUDENT) {
  const familyId = getValue(record, "family_id");
  if (familyId !== null && !familyIds.has(familyId)) setValue(record, "family_id", null);
}
for (const record of records.CLASS_REG_INFO) {
  const studentId = getValue(record, "student_id");
  if (studentId !== null && !studentIds.has(studentId)) setValue(record, "student_id", null);
  for (const session of ["session_1", "session_2", "session_3"]) {
    const classId = getValue(record, session);
    if (!classId || !classIds.has(classId)) setValue(record, session, null);
  }
}
for (const record of records.FAMILY_REGISTRATION) {
  const familyId = getValue(record, "family_id");
  if (familyId !== null && !familyIds.has(familyId)) setValue(record, "family_id", null);
}

const importOrder = [
  "CLASS_TIME",
  "TEACHER_CONTACT",
  "CLASS",
  "FAMILY",
  "STUDENT",
  "CLASS_REG_INFO",
  "FAMILY_REGISTRATION",
  "family_reg_test",
];

for (const table of importOrder) {
  outputStream.write(`\n-- ${table}: ${records[table].length} rows\n`);
  for (const record of records[table]) {
    const values = record.targetValues.map((value, index) =>
      sqlValue(value, record.booleanTargets.has(record.targetColumns[index])));
    outputStream.write(
      `insert into ${record.mapping.target} (${record.targetColumns.join(", ")}) values (${values.join(", ")}) ` +
      `on conflict (id) do update set ${record.targetColumns.filter((column) => column !== "id").map((column) => `${column} = excluded.${column}`).join(", ")};\n`,
    );
  }
}

outputStream.write(`

select setval(pg_get_serial_sequence('sccs.class_times', 'id'), coalesce(max(id), 1), true) from sccs.class_times;
select setval(pg_get_serial_sequence('sccs.teachers', 'id'), coalesce(max(id), 1), true) from sccs.teachers;
select setval(pg_get_serial_sequence('sccs.classes', 'id'), coalesce(max(id), 1), true) from sccs.classes;
select setval(pg_get_serial_sequence('sccs.families', 'id'), coalesce(max(id), 1), true) from sccs.families;
select setval(pg_get_serial_sequence('sccs.students', 'id'), coalesce(max(id), 1), true) from sccs.students;
select setval(pg_get_serial_sequence('sccs.class_registrations', 'id'), coalesce(max(id), 1), true) from sccs.class_registrations;
select setval(pg_get_serial_sequence('sccs.family_registrations', 'id'), coalesce(max(id), 1), true) from sccs.family_registrations;

commit;
`);
outputStream.end();
await new Promise((resolve, reject) => {
  outputStream.on("finish", resolve);
  outputStream.on("error", reject);
});

console.log(JSON.stringify({ source, sourceEncoding, output, counts }, null, 2));
