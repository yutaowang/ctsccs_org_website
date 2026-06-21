import React, { useEffect, useState } from "react";
import { supabase } from "./supabase";

const oldSite = "https://ctsccs.org/";

const isLocalPath = (path) => (
  path.startsWith("/")
  || path.startsWith("Forms/")
  || path.startsWith("Newsletters/")
  || path.startsWith("course_description/")
);
const localPath = (path) => path.startsWith("/") ? path : `/${path}`;

const external = (path) => path.startsWith("http") || path.startsWith("mailto:")
  ? path
  : `${oldSite}${path}`;

function ExternalLink({ href, children, className }) {
  if (isLocalPath(href)) {
    return (
      <a className={className} href={localPath(href)} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <a className={className} href={external(href)} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function Page({ eyebrow, title, children }) {
  return (
    <article className="inner-page">
      <header className="page-title">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
      </header>
      {children}
    </article>
  );
}

function Section({ title, children, className = "" }) {
  return (
    <section className={`page-section ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

function Download({ href, children }) {
  return <ExternalLink className="download-link" href={href}><span>PDF</span>{children}</ExternalLink>;
}

function About({ Link }) {
  return (
    <Page eyebrow="学校概况 Our School" title="学校简介 About Us">
      <Section>
        <p>假如时光老人可以“倒行逆时”，把您带回到二十世纪七十年代，您不妨到康州的纽伦敦走一走。在那里，约十五户华人家庭正在组建一所中文学校。纽伦敦公共图书馆是这所学校的第一个校址，十几个孩子成了第一批学生。</p>
        <p>If time could turn back to the late 1970s, you would find about fifteen Chinese families in New London, Connecticut, working together to start a Chinese school. The New London Public Library became the school's first home, and a small group of children became its first students.</p>
        <p>三十多年后的今天，当您走进位于康州东南海滨的 Waterford 高中，重游这所中文学校时，迎接您的将是四十多名教师和三百多名来自华人家庭和其他族裔家庭的学生。东南康州中文学校已注册成为一所非营利学校，学校实行行政团队和家长会（PTA）共商校事、校董事会监督和校长负责执行的现代管理体制。</p>
        <p>Today, at Waterford High School on the southeastern Connecticut shoreline, SCCS serves more than 300 students with the help of over 40 teachers. The school is a registered nonprofit organization with an administrative team, PTA collaboration, board oversight and principal-led operations.</p>
        <p>在广大家长、朋友以及各界人士的支持和关爱下，学校一贯秉承“思想力求创新，行动务必扎实”的原则，发展成为一所教学目标清晰、办学理念新颖、规章制度齐全、课程设置广泛的社区综合性学校。</p>
        <p>With the support of parents, friends and the broader community, SCCS has grown into a comprehensive community school with clear educational goals, a practical spirit, well-developed policies and a broad curriculum.</p>
      </Section>
      <div className="two-column-sections">
        <Section title="我们的传统 Our Heritage">
          <p>东南康州中文学校成立于二十世纪七十年代末，起源于纽伦敦的一个小图书馆，由十五户华人家庭的家长们发起。今天，学校已发展成为拥有四十多名教职员工和三百多名学生的非营利教育机构，服务于 New London、Norwich、New Haven 和罗德岛等周边地区。</p>
          <p>SCCS was founded in the late 1970s by parents from fifteen families and began in a small library in New London. It is now a nonprofit educational organization serving students from New London, Norwich, New Haven, Rhode Island and surrounding communities.</p>
        </Section>
        <Section title="我们的使命 Our Mission">
          <p>培养学生在全球化环境中具有扎实的双语能力和多元文化素养。</p>
          <p>To prepare students to be well versed in a globalized environment through our curriculum.</p>
        </Section>
      </div>
      <Section title="我们的学校 Our School">
        <p>学校开设四十多门课程，主要集中在海外华人语言和文化教育，同时涵盖科技、艺术、音乐等多样化教育领域，并提供年度才艺表演、中文演讲比赛等支持项目。</p>
        <p>The school offers more than forty courses focused on Chinese language and culture, along with enrichment classes in technology, art, music and other subjects. SCCS also supports annual performances, speech contests and community activities.</p>
        <Link className="text-link" to="/courses">查看课程安排 View Courses →</Link>
      </Section>
      <Section title="作为一个负责任的组织 Being a Responsible Organization">
        <p>学校每年提供多种发展项目，包括奖学金、志愿教学助理计划、学生领导力项目，以及社区外展活动。所有学生和家长须遵守书面政策，教师必须遵循行为准则。</p>
        <p>Each year SCCS supports scholarship programs, volunteer teaching assistant opportunities, student leadership initiatives and community outreach. Students, parents and teachers are expected to follow school policies and codes of conduct.</p>
        <div className="download-grid">
          <Download href="Forms/SCCS Student Handbook - English.pdf">学校手册 Student Handbook</Download>
          <Download href="Forms/SCCS Teacher Code - English.pdf">教师行为准则 Teacher Code of Conduct</Download>
        </div>
      </Section>
    </Page>
  );
}

const adminTeam = [
  ["杨永华 Mr. Yonghua Yang", "校长 Principal", "yyang@ctsccs.org"],
  ["于卫里 Ms. Weili Yu", "教务长 Provost", "wyu@ctsccs.org"],
  ["向轶 Ms. Yi Xiang", "财务总监 Director of Finance", "yxiang@ctsccs.org"],
  ["安玲 Ms. Ling An", "总务长 Director of School Services", "lan@ctsccs.org"],
  ["刘泽亚 Ms. Zeya Liu", "总务长 Director of School Services", "zliu@ctsccs.org"],
  ["王瑜涛 Mr. Yutao Wang", "信息技术部门 IT Department", "ywang@ctsccs.org"],
];

function Administration() {
  return (
    <Page eyebrow="学校概况 Our School" title="管理团队 Management Team 2026–2027">
      <Section title="行政团队 Admin Team">
        <div className="table-wrap">
          <table>
            <thead><tr><th>姓名 Name</th><th>职务 Title</th><th>电子邮件 Email</th></tr></thead>
            <tbody>{adminTeam.map((row) => <tr key={row[2]}>{row.map((cell, i) => <td key={cell}>{i === 2 ? <a href={`mailto:${cell}`}>{cell}</a> : cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Section>
      <div className="two-column-sections">
        <Section title="董事会 Board of Directors">
          <ul className="people-list">
            {["陈儒忠 Mr. Raymond Chen", "王顺泰 Mr. Shuntai Wang", "王珂 Ms. Ke Wang", "于卫里 Ms. Weili Yu", "冯喜东 Mr. Xidong Feng"].map((name) => <li key={name}>{name}</li>)}
          </ul>
        </Section>
        <Section title="家长会 PTA Leaders">
          <ul className="people-list">
            {["罗雪梅 Ms. Xuemei Luo", "伍緎榛 Ms. Annie Sufen Chong", "吴霞 Ms. Xia Wu", "曾百灵 Ms. Bailing Zeng", "待定 TBD"].map((name) => <li key={name}>{name}</li>)}
          </ul>
        </Section>
      </div>
    </Page>
  );
}

function Regulation() {
  return (
    <Page eyebrow="学校概况 Our School" title="学校制度 Regulation">
      <Section>
        <p className="lead">学生、家长与教师共同遵循的学校政策及行为规范。</p>
        <p className="lead">School policies and conduct expectations for students, parents and teachers.</p>
        <div className="download-grid">
          <Download href="Forms/SCCS Student Handbok - Chinese.pdf">学生手册（中文）</Download>
          <Download href="Forms/SCCS Student Handbook - English.pdf">学生手册 Student Handbook</Download>
          <Download href="Forms/SCCS Teacher Code - Chinese.pdf">教师守则（中文）</Download>
          <Download href="Forms/SCCS Teacher Code - English.pdf">教师守则 Code of Conduct for Teachers</Download>
        </div>
      </Section>
    </Page>
  );
}

const newsletters = [
  ["2015 No.2", "Newsletters/SCCS Newsletter 2015 No 2 English.pdf", "Newsletters/SCCS Newsletter 2015 No 2 Chinese.pdf"],
  ["2015 No.1", "Newsletters/SCCS Newsletter 2015 No 1 English.pdf", "Newsletters/SCCS Newsletter 2015 No 1 Chinese.pdf"],
  ["2014 No.4", "Newsletters/SCCS Newsletter 2014 No 4 English.pdf", "Newsletters/SCCS Newsletter 2014 No 4 Chinese.pdf"],
  ["2014 No.3", "Newsletters/SCCS Newsletter 2014 No 3 English.pdf", "Newsletters/SCCS Newsletter 2014 No 3 Chinese.pdf"],
  ["2014 No.2", "Newsletters/SCCS Newsletter 2014 No 2 English.pdf", "Newsletters/SCCS Newsletter 2014 No 2 Chinese.pdf"],
  ["2014 No.1", "Newsletters/SCCS Newsletter 2014 No 1 English.pdf", "Newsletters/SCCS Newsletter 2014 No 1 Chinese.pdf"],
  ["2013 No.5", "Newsletters/SCCS Newsletter 2013 No 5 English.pdf", "Newsletters/SCCS Newsletter 2013 No 5 Chinese.pdf"],
  ["2013 No.4", "Newsletters/SCCS Newsletter 2013 No 4 English.pdf", "Newsletters/SCCS Newsletter 2013 No 4 Chinese.pdf"],
  ["2013 No.3", "Newsletters/SCCS Newsletter 2013 No 3 English.pdf", "Newsletters/SCCS Newsletter 2013 No 3 Chinese.pdf"],
  ["2013 No.2", "Newsletters/SCCS Newsletter 2013 No 2 English.pdf", "Newsletters/SCCS Newsletter 2013 No 2 Chinese.pdf"],
  ["2013 No.1", "Newsletters/SCCS Newsletter 2013 No 1 English.pdf", "Newsletters/SCCS Newsletter 2013 No 1 Chinese.pdf"],
  ["2012 No.5", "Newsletters/SCCS Newsletter 2012 No 5 English.pdf", "Newsletters/SCCS Newsletter 2012 No 5 Chinese.pdf"],
  ["2012 No.4", "Newsletters/SCCS Newsletter 2012 No 4 English.pdf", "Newsletters/SCCS Newsletter 2012 No 4 Chinese.pdf"],
];

function Newsletters() {
  return (
    <Page eyebrow="学校概况 Our School" title="新闻快讯 Newsletter">
      <Section>
        <div className="newsletter-list">
          {newsletters.map(([issue, english, chinese]) => (
            <article key={issue}>
              <div><span>新闻快讯 NEWSLETTER</span><h2>{issue}</h2></div>
              <div><Download href={chinese}>中文</Download><Download href={english}>English</Download></div>
            </article>
          ))}
        </div>
      </Section>
    </Page>
  );
}

function Catalog() {
  return (
    <Page eyebrow="教学教务 Academics" title="教学大纲 School Catalog">
      <Section title="基本原则和教学目标：“先快后慢”和“500+3” Teaching Principles and Goals">
        <p>基于学生年龄、语言学习规律以及美国学校课业负担随年级上升而由轻到重的特点，我校中文教学采用先紧后松、先快后慢的模式。低年级集中识字写字；中年级通过阅读扩大词汇量、提高理解并开始基本写作；高年级加强写作、阅读理解和中文实际应用能力，同时为 AP 和 SAT 中文考试打下基础。</p>
        <p>“五百+三”计划是学校整体教学纲要。学生在九年期间实现五百个基本汉字的四会：会认、会读、会写、会用；并至少写一篇中文作文、参加一次中文演讲比赛、读一本中文阅读材料。</p>
        <p>SCCS Chinese language classes focus on functional listening, speaking, reading and writing. Students at every level demonstrate practical use of Chinese, while advanced study also prepares students for Chinese AP and SAT exams.</p>
        <p>The “500 + 3” plan requires students to recognize, read, write and use 500 Chinese characters over nine years, write at least one Chinese essay, enter a speech contest and complete a Chinese reading.</p>
      </Section>
      <Section title="详细教学大纲 Full Catalog">
        <div className="download-grid">
          <Download href="Forms/SCCS Catalog - Chinese.pdf">中文教学大纲 Chinese Catalog</Download>
          <Download href="Forms/SCCS Catalog - English.pdf">英文教学大纲 English Catalog</Download>
        </div>
      </Section>
    </Page>
  );
}

function Registration({ Link }) {
  return (
    <Page eyebrow="教学教务 Academics" title="课程注册 Registration">
      <Section>
        <div className="notice-banner"><strong>2026 秋季开学日期 Fall 2026 Start Date</strong><span>2026 年 9 月 7 日 September 7, 2026</span></div>
        <ol className="numbered-list">
          <li><strong>注册期限 Registration Deadline</strong><p>请于 2026 年 9 月 21 日前完成注册缴费，在此之前注册的家庭免除 $25 注册费。</p><p>Please complete registration and payment by September 21, 2026. Families who register before this date will not be charged the $25 registration fee.</p></li>
          <li><strong>网上注册 Online Registration</strong><p>网上注册于 2026 年 7 月 20 日上午 9 时后开始。完成后请打印注册表，并同支票一同交到注册处。</p><p>Online registration opens after 9:00 AM on July 20, 2026. After registering, please print the registration summary and bring it with your payment check to the Registration Desk.</p></li>
          <li><strong>家庭账户 Family Account</strong><p>每个学生家庭需要一个家庭账户。请加入微信号以方便学校联系，不要重复建立新账户。</p><p>Each family needs one family account. Please include your WeChat ID if available so the school can communicate with you. Do not create duplicate accounts.</p></li>
          <li><strong>课程 Courses</strong><p>具体课程、时间、地点和收费情况，请查看 <Link to="/courses">课程安排</Link>。</p><p>For course names, times, classrooms and donation amounts, please visit the <Link to="/courses">Courses</Link> page.</p></li>
          <li><strong>课本 Textbooks</strong><p>课本在开学第一天由任课老师发放。改课或退课时，请将课本退回学校办公室。</p><p>Textbooks are distributed by teachers on the first day of school. If you change or drop a class, please return the textbook to the school office.</p></li>
          <li><strong>付款与邮寄 Payment and Mailing</strong><p>支票请开给 SCCS，邮寄至 SCCS PO Box 766, East Lyme, CT 06333。银行退票罚款 $25。</p><p>Please make checks payable to SCCS and mail them to SCCS, PO Box 766, East Lyme, CT 06333. Returned checks are subject to a $25 fee.</p></li>
          <li><strong>加课、转课、退课 Add, Change or Drop Classes</strong><p>请于 2026 年 9 月 21 日前在线办理。该日期后学校不再接受转课或退课请求。</p><p>Please complete class additions, changes or drops online by September 21, 2026. After that date, course changes and drops will no longer be accepted.</p></li>
        </ol>
        <div className="action-row">
          <Link className="button-link" to="/login">进入网上注册 Online Registration</Link>
          <Download href="Forms/SCCS Online Registration User Guide.pdf">网上注册指南 User Guide</Download>
        </div>
      </Section>
    </Page>
  );
}

const calendarEvents = [
  ["9/7/26", "2026 秋季学期开学 Start of Fall 2026 Semester"],
  ["9/14/26", ""],
  ["9/21/26", "更改课程注册截止日 Last Day to Change Class Registration"],
  ["9/28/26", ""], ["10/5/26", ""], ["10/12/26", ""], ["10/19/26", ""], ["10/26/26", ""],
  ["11/2/26", "夏令时结束 Daylight Saving Time Ends"], ["11/9/26", ""], ["11/16/26", ""], ["11/23/26", ""],
  ["11/30/26", "感恩节假期 · 停课 Thanksgiving Holiday · No School"],
  ["12/7/26", ""], ["12/14/26", "期末考试 Final Exam"],
  ["12/21/26", "中文演讲比赛 · 秋季学期结束 · 全勤要求 Speech Contest · End of Fall Semester · Full Attendance Required"],
  ["12/28/26", "圣诞假期 · 停课 Christmas Holiday · No School"],
  ["1/4/27", "新年假期 · 停课 New Year Holiday · No School"],
  ["1/11/27", "2027 春季学期开学 Start of Spring 2027 Semester"], ["1/18/27", ""], ["1/25/27", ""],
  ["2/1/27", ""], ["2/8/27", ""], ["2/15/27", "春节庆祝 Chinese New Year Celebration"], ["2/22/27", ""],
  ["3/1/27", ""], ["3/8/27", "夏令时开始 Daylight Saving Time Starts"], ["3/15/27", ""], ["3/22/27", ""], ["3/29/27", ""],
  ["4/5/27", ""], ["4/12/27", "春假 · 停课 Spring Break · No School"], ["4/19/27", ""], ["4/26/27", ""],
  ["5/3/27", ""], ["5/10/27", "期末考试 Final Exam"], ["5/17/27", "才艺表演 · 学年结束 Talent Show · End of Academic Year"],
];

function Calendar() {
  return (
    <Page eyebrow="教学教务 Academics" title="学校校历 2026–2027 School Calendar">
      <Section>
        <Download href="Forms/SCCS 2024-2025 School Calendar.pdf">下载校历 Download PDF</Download>
        <div className="calendar-grid">
          {calendarEvents.map(([date, event]) => (
            <div className={event.includes("No School") ? "no-school" : ""} key={date}>
              <strong>{date}</strong><span>{event || "上课日 School Day"}</span>
            </div>
          ))}
        </div>
        <div className="note-box">
          <p>注：如果遇到雪天停课，学校会在当天早上 8 点之前通过电话通知家长，请确保电话号码已在在线系统中注册。</p>
          <p>Snow day cancellations will be announced by telephone no later than 8 AM.</p>
        </div>
      </Section>
    </Page>
  );
}

const chineseCourses = [
  ["Children Spoken Mandarin (5+)", "Ziyan Xu", "206", "$290", "09:30–11:05", "course_description/cn_beginner.pdf"],
  ["Grade 1", "Yulan Zhang", "208", "$290", "09:30–11:05", "course_description/cn_Pioneer.pdf"],
  ["Grade 2", "Yaqin Li", "224", "$290", "09:30–11:05", ""],
  ["Grade 3", "Ren Hu", "214", "$290", "09:30–11:05", ""],
  ["Grade 4", "Yan Zhuang", "212", "$290", "09:30–11:05", "course_description/cn_Discoverer.pdf"],
  ["Grade 5", "Zeya Liu", "215", "$290", "09:30–11:05", "course_description/cn_Creator.pdf"],
  ["Maliping 5", "Chongmin Ji", "216", "$350", "09:30–11:05", ""],
  ["Grade 7", "Jianmin Sun", "217", "$290", "09:30–11:05", "course_description/cn_Investor.pdf"],
  ["Grade 8", "Aifang Li", "218", "$290", "09:30–11:05", "course_description/cn_Scholar.pdf"],
  ["Maliping 8 (Excluding Textbooks)", "Weili Yu", "210", "$290", "09:30–11:05", ""],
  ["Colloquial Mandarin Chinese", "Wenhua Jiao", "206", "$150", "12:00–12:45", "course_description/cn_CMC.pdf"],
  ["AP Chinese and Culture", "Liurong Luo", "220", "$290", "09:30–11:05", "course_description/satii.pdf"],
];

const courseGroups = [
  {
    id: "chinese",
    label: "中文课 Chinese",
    courses: chineseCourses,
  },
  {
    id: "math",
    label: "数学课 Math",
    courses: [
      ["Math Advanced 3rd grade", "Katherine Zhang", "206", "$200", "11:10–11:55", "course_description/math_grade3.pdf"],
      ["Math Advanced 4th grade", "Alina Li", "218", "$200", "11:10–11:55", "course_description/math_grade4.pdf"],
      ["Math Advanced 5th grade", "Halen Liu", "212", "$200", "11:10–11:55", "course_description/math_grade5.pdf"],
      ["Math Advanced 6th grade", "Jessica Feng", "214", "$200", "11:10–11:55", "course_description/math_grade6.pdf"],
      ["Math Advanced 7th grade / Basic Pre-algebra", "Claire Li", "215", "$200", "11:10–11:55", ""],
      ["Pre Algebra", "Julian Horst", "216", "$200", "11:10–11:55", "course_description/math_pre_algrbra.pdf"],
      ["Algebra", "Danlu Li", "208", "$200", "11:10–11:55", "course_description/math_algebra.pdf"],
      ["Advanced Math League", "Ethan Wang", "210", "$200", "12:00–12:45", "course_description/math_league.pdf"],
      ["Geometry", "Mark Noe", "209", "$200", "11:10–11:55", "course_description/geometry.pdf"],
      ["Amateur Radio Technician License Course", "Mark Noe", "209", "$200", "10:20–11:05", "course_description/artlc.pdf"],
      ["Introduction to Computer Science and Electronics", "Mark Noe", "209", "$200", "12:00–12:45", "course_description/ComputerScienceCourseListing.pdf"],
      ["Introduction to Robotics", "Xiaochen Li", "212", "$200", "12:00–12:45", "course_description/cs_robotics.pdf"],
    ],
  },
  {
    id: "arts",
    label: "文体课 Art & PE",
    courses: [
      ["Academic Art (Age 9+)", "Yujuan Zhai", "219", "$300", "12:00–12:45", "course_description/academic_art.pdf"],
      ["Chess Advanced", "Julian Horst", "214", "$150", "12:00–12:45", "course_description/chess.pdf"],
      ["Chess Basic", "Stephen Faulkner", "215", "$150", "12:00–12:45", "course_description/chess.pdf"],
      ["Dancing Beginner", "Claire Li", "222", "$150", "12:00–12:45", "course_description/dance_beginner.pdf"],
      ["Flute", "Katherine Zhang", "208", "$150", "12:00–12:45", "course_description/Flute.pdf"],
      ["Oil Pastel (5+)", "Krystal Chen", "224", "$300", "11:10–11:55", "course_description/OilPastel.pdf"],
      ["Violin", "Joshua Payne", "218", "$150", "12:00–12:45", "course_description/violin.pdf"],
      ["Chinese Watercolor Painting (7+)", "Yujuan Zhai", "219", "$300", "11:10–11:55", ""],
      ["Kids Basketball", "Aaron Chen", "Gym", "$150", "12:00–12:45", "course_description/basketball.pdf"],
      ["Practical Course in Communication and Leadership", "Rich Derksen", "220", "$200", "12:00–12:45", "course_description/public%20speaking.pdf"],
    ],
  },
  {
    id: "sat",
    label: "PSAT & SAT+",
    courses: [
      ["SAT / PSAT", "Matthew Simpson", "222", "$500", "09:30–11:05", ""],
    ],
  },
];

export const courseDescriptionLinks = Object.fromEntries(
  courseGroups.flatMap((group) => group.courses)
    .filter(([name, , , , , file]) => file)
    .map(([name, , , , , file]) => [name.toLowerCase(), localPath(file)]),
);

export const courseDescriptionLinkFor = (courseName) => (
  courseDescriptionLinks[(courseName || "").toLowerCase()] || ""
);

const databaseCourseTypeGroups = {
  CHN: { id: "chinese", label: "中文课 Chinese", order: 0 },
  BB: { id: "math", label: "数学课 Math", order: 1 },
  CC: { id: "arts", label: "文体课 Art & PE", order: 2 },
  SAT: { id: "sat", label: "SAT", order: 3 },
};

function Courses() {
  const [activeGroupId, setActiveGroupId] = useState(courseGroups[0].id);
  const [databaseCourses, setDatabaseCourses] = useState([]);

  useEffect(() => {
    if (!supabase) return;
    const loadCourses = async () => {
      const viewResult = await supabase
        .from("public_course_schedule")
        .select("id, name, teacher_name, teacher_short_name, classroom, donation, type, display_time")
        .eq("is_open", true)
        .order("name");
      if (!viewResult.error) {
        setDatabaseCourses(viewResult.data || []);
        return;
      }
      const classResult = await supabase
        .from("classes")
        .select("id, name, teacher_short_name, classroom, donation, type, class_times(display_time)")
        .eq("is_open", true)
        .order("name");
      setDatabaseCourses(classResult.data || []);
    };
    loadCourses();
  }, []);

  const databaseGroups = Object.entries(
    databaseCourses.reduce((groups, course) => {
      const type = course.type || "Other";
      groups[type] = [...(groups[type] || []), [
        course.name,
        course.teacher_name || course.teacher_short_name || "",
        course.classroom || "",
        course.donation == null ? "" : `$${course.donation}`,
        course.display_time || course.class_times?.display_time || "",
        courseDescriptionLinkFor(course.name),
      ]];
      return groups;
    }, {}),
  ).map(([type, courses]) => ({
    id: databaseCourseTypeGroups[type]?.id || `database-${type}`,
    label: databaseCourseTypeGroups[type]?.label || type,
    order: databaseCourseTypeGroups[type]?.order ?? 99,
    courses,
  })).sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
  const displayedGroups = databaseGroups.length > 0 ? databaseGroups : courseGroups;
  const activeGroup = displayedGroups.find((group) => group.id === activeGroupId) || displayedGroups[0];

  return (
    <Page eyebrow="教学教务 Academics" title="课程安排 Courses">
      <Section>
        <div className="course-tabs" role="tablist" aria-label="课程类别">
          {displayedGroups.map((group) => (
            <button
              id={`course-tab-${group.id}`}
              className={group.id === activeGroupId ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={group.id === activeGroupId}
              aria-controls={`course-panel-${group.id}`}
              onClick={() => setActiveGroupId(group.id)}
              key={group.id}
            >
              {group.label}
              <span>{group.courses.length}</span>
            </button>
          ))}
        </div>
        <div
          id={`course-panel-${activeGroup.id}`}
          className="table-wrap course-panel"
          role="tabpanel"
          aria-labelledby={`course-tab-${activeGroup.id}`}
        >
          <table>
            <thead><tr><th>课程 Class Name</th><th>教师 Teacher</th><th>教室 Room</th><th>捐款 Donation</th><th>时间 Time</th><th>介绍 Introduction</th></tr></thead>
            <tbody>{activeGroup.courses.map(([name, teacher, room, fee, time, file]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{teacher}</td><td>{room}</td><td>{fee}</td><td>{time}</td>
                <td>{file ? <ExternalLink href={file}>课程介绍 Course description</ExternalLink> : ""}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="note-box">
          <p>SCCS 所有课程年龄要求为 5 岁以上。All SCCS courses require students to be age 5 or older.</p>
        </div>
      </Section>
    </Page>
  );
}

function Contact({ Link }) {
  const details = [
    ["上课时间 School Hours", "每周日 9:30 AM – 12:45 PM"],
    ["学校地址 Physical Address", "20 Rope Ferry Road, Waterford, CT 06385"],
    ["邮寄地址 Mailing Address", "SCCS, PO Box 766, East Lyme, CT 06333"],
    ["联系电邮 Email", "help@ctsccs.org"],
    ["联系电话 Phone", "(860) 451-9292"],
  ];
  return (
    <Page eyebrow="更多信息 More About" title="联系我们 Contact Us">
      <Section>
        <div className="contact-grid">
          {details.map(([label, value]) => (
            <div key={label}><span>{label}</span>{label.includes("Email") ? <a href={`mailto:${value}`}>{value}</a> : <strong>{value}</strong>}</div>
          ))}
        </div>
        <div className="action-row">
          <Link className="button-link" to="/calendar">查看校历 View Calendar</Link>
          <Link className="outline-link" to="/location">查看驾车路线 Driving Directions</Link>
        </div>
        <div className="note-box">
          <p>东南康州中文学校的工作人员都是志愿者，利用周末空闲时间为社区服务，请大家理解、配合和积极参与！</p>
          <p>Our staff are volunteers who donate their weekend time to serve the community. Your understanding, cooperation and participation are greatly appreciated.</p>
        </div>
      </Section>
    </Page>
  );
}

const directions = [
  ["从北方出发 From North", "沿 I-395 South 至 Waterford 的 CT-85 South，从出口 2 下高速，驶向 Waterford/Chesterfield。沿 CT-85 South、Cross Road 和 US-1 North/Boston Post Road 前往目的地。 Take I-395 South to CT-85 South in Waterford. Use Exit 2 toward Waterford/Chesterfield, then follow CT-85 South, Cross Road and US-1 North/Boston Post Road to the school."],
  ["从南方或西南方向 From South/Southwest", "沿 I-95 North 往 Providence 方向行驶，在 East Lyme 的出口 75 下高速，往 Waterford 方向，沿 US-1 North/Boston Post Road 抵达目的地。 Take I-95 North toward Providence. Use Exit 75 in East Lyme toward Waterford, then follow US-1 North/Boston Post Road to the school."],
  ["从北方或东北方向 From North/Northeast", "沿 I-95 South 往 New Haven 方向行驶，在 Waterford 的出口 82 下高速，驶向 CT-85/Broad Street，沿 CT-85 South/Broad Street 抵达目的地。 Take I-95 South toward New Haven. Use Exit 82 in Waterford toward CT-85/Broad Street, then follow CT-85 South/Broad Street to the school."],
];

function Location() {
  return (
    <Page eyebrow="更多信息 More About" title="交通指南 Location">
      <Section>
        <div className="location-hero">
          <span>学校地址 School Location</span>
          <h2>20 Rope Ferry Road<br />Waterford, CT 06385</h2>
          <p>Waterford 高中 · 周日 9:30 AM – 12:45 PM Waterford High School · Sundays 9:30 AM – 12:45 PM</p>
          <a className="button-link" href="https://maps.google.com/?q=20+Rope+Ferry+Road+Waterford+CT+06385" target="_blank" rel="noreferrer">在地图中打开 Open in Maps</a>
        </div>
      </Section>
      <Section title="驾车路线 Driving Directions">
        <div className="direction-list">
          {directions.map(([title, text], index) => <article key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}
        </div>
      </Section>
    </Page>
  );
}

function CommunityServices() {
  return (
    <Page eyebrow="更多信息 More About" title="公益服务 Community Services">
      <Section>
        <p className="lead">社区志愿服务在美国有悠久而光荣的传统。SCCS 学生和家长长期投入时间服务社区，在贡献中成长，也通过行动成为彼此的榜样。</p>
        <p className="lead">Community volunteer service has a long and proud history in America. SCCS students and parents have devoted countless hours to serve our community, making it a better place while becoming role models through service.</p>
      </Section>
      <div className="feature-cards">
        <article>
          <img src={`${oldSite}Images/lyme_light.jpg`} alt="Lyme Light" />
          <div><span>学生表演团队 Student Performance Group</span><h2>The Lyme Light</h2><p>Lyme Light 是 2013 年 3 月成立的非营利学生表演团队，为学生提供社区服务机会，并在本地区养老中心和护理机构演出。</p><p>Lyme Light is a nonprofit performance group founded in March 2013 to provide community service opportunities for students. The group performs at senior centers and nursing homes throughout the region.</p><ExternalLink className="text-link" href="https://www.ctlymelight.org/">访问 Lyme Light Visit Lyme Light →</ExternalLink></div>
        </article>
        <article>
          <img src={`${oldSite}Images/PresidentsVolunteerAward.jpg`} alt="President's Volunteer Service Award" />
          <div><span>志愿服务表彰 Volunteer Recognition</span><h2>总统志愿服务奖 President's Volunteer Service Awards</h2><p>SCCS 是总统志愿服务奖的注册认证机构，可为符合条件的志愿者提名、核实服务时间并颁发奖项。</p><p>SCCS is a registered certifying organization for the President's Volunteer Service Award and can nominate eligible volunteers, verify service and distribute awards.</p><a className="text-link" href="mailto:ytu@ctsccs.org">联系涂音宇老师 Contact Ms. Yinyu Tu →</a></div>
        </article>
      </div>
    </Page>
  );
}

const sponsors = [
  ["邦联地产", "http://www.rmaxunited.com/", "Images/banglian.png"],
  ["United Way", "http://liveunited.org/", "Images/UnitedWay.jpg"],
  ["Wayne Realty LLC", "http://www.waynerealtyllc.com/mortgage.html", "Images/banner_Qian.gif"],
];

function Sponsors() {
  return (
    <Page eyebrow="更多信息 More About" title="友情赞助 Proud Sponsors">
      <Section>
        <p className="lead">社区朋友的慷慨支持帮助学校开展日常运营、购置教材和教学材料、支持教师培训、教育活动和拓展课程。感谢所有友情赞助者，所有捐助都直接用于支持 SCCS 教育项目。</p>
        <p className="lead">The generosity of our community supports school operations, books and teaching materials, teacher training, educational events and enrichment activities. Thanks to our Proud Sponsors, 100% of contributed funds directly support SCCS educational programs.</p>
        <div className="sponsor-grid">
          {sponsors.map(([name, href, image]) => <ExternalLink href={href} key={name}><img src={`${oldSite}${image}`} alt={name} /><strong>{name}</strong></ExternalLink>)}
        </div>
      </Section>
    </Page>
  );
}

const resources = [
  ["下载《中文》教材", "http://www.hwjyw.com/textbooks/downloads/zhongwen/", "Images/links_1.jpg"],
  ["《中文》多媒体光盘", "http://www.hwjyw.com/hwjc/hwjc-sygp/index111.shtml", "Images/links_2.jpg"],
  ["下载田字格", "Forms/SCCS Exercising Sheet.pdf", "Images/tian_zi_ge.JPG"],
  ["朗朗中文", "http://www.yes-chinese.com/", "Images/links_4.jpg"],
  ["悟空识字", "http://www.gongfubb.com/home/wksz.php", "Images/links_5.gif"],
  ["华文教育网", "http://www.hwjyw.com/", "Images/links_3.jpg"],
  ["马立平教材", "https://www.heritagechinese.com/", "Images/mlp.png"],
];

function Resources() {
  return (
    <Page eyebrow="更多信息 More About" title="中文资讯 Chinese Resources">
      <Section>
        <p className="lead">这里收集了中文学习、教材、练习纸和相关文化教育资源，供学生和家长参考。</p>
        <p className="lead">This page collects Chinese learning resources, textbooks, practice sheets and related cultural education links for students and parents.</p>
        <div className="resource-grid">
          {resources.map(([name, href, image]) => <ExternalLink href={href} key={name}><img src={`${oldSite}${image}`} alt="" /><strong>{name}</strong><span>打开资源 ↗</span></ExternalLink>)}
        </div>
      </Section>
    </Page>
  );
}

const communityLinks = [
  ["East Lyme Public Schools", "http://www.eastlymeschools.org/"],
  ["Waterford Public Schools", "http://www.waterfordschools.org/wsd/site/default.asp"],
  ["Old Lyme Public Schools", "http://www.region18.org/"],
  ["New London Public Schools", "http://www.newlondon.org/"],
  ["Stonington Public Schools", "http://www.stoningtonschools.org/page.cfm"],
  ["Salem Public Schools", "http://www.salemschools.org/salem/site/default.asp"],
  ["Connecticut College", "http://www.conncoll.edu/"],
  ["Pine Point School", "http://www.pinepoint.org/"],
  ["Southern Connecticut Chinese School", "http://www.ynhchineseschool.org/prod_v08/public/main.php"],
  ["Huaxia Chinese School at Connecticut", "http://www.hxct.org"],
  ["CT Chinese Language Academy", "http://www.ccla-ct.org/"],
];

function Links() {
  return (
    <Page eyebrow="更多信息 More About" title="社区链接 Community Links">
      <Section>
        <p className="lead">以下链接连接到周边学校、教育机构和友校资源，方便家长和社区成员查询。</p>
        <p className="lead">The following links connect families and community members to nearby schools, educational organizations and partner Chinese schools.</p>
        <div className="community-links">
          {communityLinks.map(([name, href], index) => <ExternalLink href={href} key={name}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><i>↗</i></ExternalLink>)}
        </div>
      </Section>
    </Page>
  );
}

function Feedback() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submitFeedback = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        phone: form.get("phone") || "",
        message: form.get("message"),
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(result.error || "Feedback submission failed.");
      return;
    }
    setSubmitted(true);
    event.currentTarget.reset();
  };

  return (
    <Page eyebrow="更多信息 More About" title="意见反馈 Feedback">
      <Section>
        <p className="lead">感谢您访问 SCCS 网站。如果您在使用网站时遇到困难，或有问题、想法和建议，欢迎给我们留言。您的反馈会帮助我们把网站做得更好。</p>
        <p className="lead">Thank you for visiting the SCCS website. If you have any difficulties, questions, ideas or suggestions, please send us a message. Your feedback helps make this site better.</p>
        {submitted ? (
          <div className="success-message"><strong>谢谢您的反馈！ Thank you for your feedback!</strong><p>我们已收到您的反馈，并已发送给 SCCS 团队。</p><p>We received your feedback and sent it to the SCCS team.</p></div>
        ) : (
          <form className="feedback-form" onSubmit={submitFeedback}>
            <label><span>您的姓名 Your Name *</span><input name="name" required /></label>
            <label><span>您的邮箱 Your Email *</span><input name="email" type="email" required /></label>
            <label><span>您的电话 Your Phone</span><input name="phone" type="tel" /></label>
            <label className="full"><span>意见或问题 Your Comment or Questions *</span><textarea name="message" rows="7" required /></label>
            {error && <div className="form-message error">{error}</div>}
            <button className="button-link" type="submit" disabled={busy}>{busy ? "正在提交... Submitting..." : "提交反馈 Submit"}</button>
          </form>
        )}
      </Section>
    </Page>
  );
}

const pages = {
  "/about": About,
  "/administration": Administration,
  "/regulation": Regulation,
  "/newsletters": Newsletters,
  "/catalog": Catalog,
  "/registration": Registration,
  "/calendar": Calendar,
  "/courses": Courses,
  "/contact": Contact,
  "/location": Location,
  "/community-services": CommunityServices,
  "/sponsors": Sponsors,
  "/resources": Resources,
  "/links": Links,
  "/feedback": Feedback,
};

export const pageRoutes = Object.keys(pages);

export function PageContent({ path, Link }) {
  const Component = pages[path];
  return <Component Link={Link} />;
}
