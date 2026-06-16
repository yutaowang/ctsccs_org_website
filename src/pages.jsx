import React, { useEffect, useState } from "react";
import { publicSupabase, supabase } from "./supabase";

const oldSite = "https://ctsccs.org/";

const isLocalPath = (path) => path.startsWith("/") || path.startsWith("course_description/");
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
    <Page eyebrow="Our School" title="学校简介 About Us">
      <Section>
        <p>假如时光老人可以“倒行逆时”，把您带回到二十世纪七十年代，您不妨到康州的纽伦敦走一走。在那里，约十五户华人家庭正在组建一所中文学校。纽伦敦公共图书馆是这所学校的第一个校址，十几个孩子成了第一批学生。</p>
        <p>三十多年后的今天，当您走进位于康州东南海滨的 Waterford 高中，重游这所中文学校时，迎接您的将是四十多名教师和三百多名来自华人家庭和其他族裔家庭的学生。东南康州中文学校已注册成为一所非营利学校，学校实行行政团队和家长会（PTA）共商校事、校董事会监督和校长负责执行的现代管理体制。</p>
        <p>在广大家长、朋友以及各界人士的支持和关爱下，学校一贯秉承“思想力求创新，行动务必扎实”的原则，发展成为一所教学目标清晰、办学理念新颖、规章制度齐全、课程设置广泛的社区综合性学校。</p>
      </Section>
      <div className="two-column-sections">
        <Section title="我们的传统 Our Heritage">
          <p>东南康州中文学校成立于二十世纪七十年代末，起源于纽伦敦的一个小图书馆，由十五户华人家庭的家长们发起。今天，学校已发展成为拥有四十多名教职员工和三百多名学生的非营利教育机构，服务于 New London、Norwich、New Haven 和罗德岛等周边地区。</p>
        </Section>
        <Section title="我们的使命 Our Mission">
          <p>培养学生在全球化环境中具有扎实的双语能力和多元文化素养。</p>
          <p>To prepare students to be well versed in a globalized environment through our curriculum.</p>
        </Section>
      </div>
      <Section title="我们的学校 Our School">
        <p>学校开设四十多门课程，主要集中在海外华人语言和文化教育，同时涵盖科技、艺术、音乐等多样化教育领域，并提供年度才艺表演、中文演讲比赛等支持项目。</p>
        <Link className="text-link" to="/courses">查看课程安排 →</Link>
      </Section>
      <Section title="作为一个负责任的组织 Being a Responsible Organization">
        <p>学校每年提供多种发展项目，包括奖学金、志愿教学助理计划、学生领导力项目，以及社区外展活动。所有学生和家长须遵守书面政策，教师必须遵循行为准则。</p>
        <div className="download-grid">
          <Download href="Forms/SCCS Handbook.pdf">学校手册</Download>
          <Download href="Forms/SCCS Teacher Code.pdf">教师行为准则</Download>
        </div>
      </Section>
      <Section title="About Us" className="english-copy">
        <p>Founded in the late 1970s by parents from fifteen families, SCCS began in the New London Public Library. It has grown into a well-established nonprofit educational organization serving more than 300 students.</p>
        <p>SCCS teaches Chinese language, preserves Chinese culture, cultivates bilingual talent, and helps students build a solid foundation in the humanities and sciences for tomorrow's global challenges.</p>
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
    <Page eyebrow="Our School" title="管理团队 Management Team 2026–2027">
      <Section title="Admin Team">
        <div className="table-wrap">
          <table>
            <thead><tr><th>姓名 Name</th><th>职务 Title</th><th>电子邮件 Email</th></tr></thead>
            <tbody>{adminTeam.map((row) => <tr key={row[2]}>{row.map((cell, i) => <td key={cell}>{i === 2 ? <a href={`mailto:${cell}`}>{cell}</a> : cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Section>
      <div className="two-column-sections">
        <Section title="Board of Directors">
          <ul className="people-list">
            {["陈儒忠 Mr. Raymond Chen", "王顺泰 Mr. Shuntai Wang", "王珂 Ms. Ke Wang", "于卫里 Ms. Weili Yu", "冯喜东 Mr. Xidong Feng"].map((name) => <li key={name}>{name}</li>)}
          </ul>
        </Section>
        <Section title="PTA Leaders">
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
    <Page eyebrow="Our School" title="学校制度 Regulation">
      <Section>
        <p className="lead">学生、家长与教师共同遵循的学校政策及行为规范。</p>
        <div className="download-grid">
          <Download href="Forms/SCCS Student Handbok - Chinese.pdf">学生手册（中文）</Download>
          <Download href="Forms/SCCS Student Handbook - English.pdf">Student Handbook</Download>
          <Download href="Forms/SCCS Teacher Code - Chinese.pdf">教师守则（中文）</Download>
          <Download href="Forms/SCCS Teacher Code - English.pdf">Code of Conduct for Teachers</Download>
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
];

function Newsletters() {
  return (
    <Page eyebrow="Our School" title="新闻快讯 Newsletter">
      <Section>
        <div className="newsletter-list">
          {newsletters.map(([issue, english, chinese]) => (
            <article key={issue}>
              <div><span>NEWSLETTER</span><h2>{issue}</h2></div>
              <div><Download href={english}>English</Download><Download href={chinese}>中文</Download></div>
            </article>
          ))}
        </div>
      </Section>
    </Page>
  );
}

function Catalog() {
  return (
    <Page eyebrow="Academics" title="教学大纲 School Catalog">
      <Section title="基本原则和教学目标：“先快后慢”和“500+3”">
        <p>基于学生年龄、语言学习规律以及美国学校课业负担随年级上升而由轻到重的特点，我校中文教学采用先紧后松、先快后慢的模式。低年级集中识字写字；中年级通过阅读扩大词汇量、提高理解并开始基本写作；高年级加强写作、阅读理解和中文实际应用能力，同时为 AP 和 SAT 中文考试打下基础。</p>
        <p>“五百+三”计划是学校整体教学纲要。学生在九年期间实现五百个基本汉字的四会：会认、会读、会写、会用；并至少写一篇中文作文、参加一次中文演讲比赛、读一本中文阅读材料。</p>
      </Section>
      <Section title="Teaching Principle and Educational Goal" className="english-copy">
        <p>SCCS Chinese language classes focus on functional listening, speaking, reading and writing. Students at every level demonstrate practical use of Chinese, while advanced study also prepares students for Chinese AP and SAT exams.</p>
        <p>The “500 + 3” plan requires students to recognize, read, write and use 500 Chinese characters over nine years, write at least one Chinese essay, enter a speech contest and complete a Chinese reading.</p>
      </Section>
      <Section title="详细教学大纲 Full Catalog">
        <div className="download-grid">
          <Download href="Forms/SCCS Catalog - Chinese.pdf">教学大纲下载</Download>
          <Download href="Forms/SCCS Catalog - English.pdf">Download Catalog</Download>
        </div>
      </Section>
    </Page>
  );
}

function Registration({ Link }) {
  return (
    <Page eyebrow="Academics" title="课程注册 Registration">
      <Section>
        <div className="notice-banner"><strong>2026 秋季开学日期</strong><span>2026 年 9 月 7 日</span></div>
        <ol className="numbered-list">
          <li><strong>注册期限</strong><p>请于 2026 年 9 月 21 日前完成注册缴费，在此之前注册的家庭免除 $25 注册费。</p></li>
          <li><strong>网上注册</strong><p>网上注册于 2026 年 7 月 20 日上午 9 时后开始。完成后请打印注册表，并同支票一同交到注册处。</p></li>
          <li><strong>家庭账户</strong><p>每个学生家庭需要一个家庭账户。请加入微信号以方便学校联系，不要重复建立新账户。</p></li>
          <li><strong>课程</strong><p>具体课程、时间、地点和收费情况，请查看 <Link to="/courses">课程安排</Link>。</p></li>
          <li><strong>课本</strong><p>课本在开学第一天由任课老师发放。改课或退课时，请将课本退回学校办公室。</p></li>
          <li><strong>付款与邮寄</strong><p>支票请开给 SCCS，邮寄至 SCCS PO Box 766, East Lyme, CT 06333。银行退票罚款 $25。</p></li>
          <li><strong>加课、转课、退课</strong><p>请于 2026 年 9 月 21 日前在线办理。该日期后学校不再接受转课或退课请求。</p></li>
        </ol>
        <div className="action-row">
          <Link className="button-link" to="/login">进入网上注册</Link>
          <Download href="Forms/SCCS Online Registration User Guide.pdf">网上注册指南</Download>
        </div>
      </Section>
    </Page>
  );
}

const calendarEvents = [
  ["9/7/26", "Start of Fall 2026 Semester"],
  ["9/14/26", ""],
  ["9/21/26", "Last Day to Change Class Registration"],
  ["9/28/26", ""], ["10/5/26", ""], ["10/12/26", ""], ["10/19/26", ""], ["10/26/26", ""],
  ["11/2/26", "Daylight Saving Time Ends"], ["11/9/26", ""], ["11/16/26", ""], ["11/23/26", ""],
  ["11/30/26", "Thanksgiving Holiday · No School"],
  ["12/7/26", ""], ["12/14/26", "Final Exam"],
  ["12/21/26", "Speech Contest · End of Fall Semester · Full Attendance Required"],
  ["12/28/26", "Christmas Holiday · No School"],
  ["1/4/27", "New Year Holiday · No School"],
  ["1/11/27", "Start of Spring 2027 Semester"], ["1/18/27", ""], ["1/25/27", ""],
  ["2/1/27", ""], ["2/8/27", ""], ["2/15/27", "Chinese New Year Celebration"], ["2/22/27", ""],
  ["3/1/27", ""], ["3/8/27", "Daylight Saving Time Starts"], ["3/15/27", ""], ["3/22/27", ""], ["3/29/27", ""],
  ["4/5/27", ""], ["4/12/27", "Spring Break · No School"], ["4/19/27", ""], ["4/26/27", ""],
  ["5/3/27", ""], ["5/10/27", "Final Exam"], ["5/17/27", "Talent Show · End of Academic Year"],
];

function Calendar() {
  return (
    <Page eyebrow="Academics" title="学校校历 2026–2027 School Calendar">
      <Section>
        <Download href="Forms/SCCS 2026-2027 School Calendar.pdf">下载校历 Download PDF</Download>
        <div className="calendar-grid">
          {calendarEvents.map(([date, event]) => (
            <div className={event.includes("No School") ? "no-school" : ""} key={date}>
              <strong>{date}</strong><span>{event || "School Day"}</span>
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
    label: "Chinese 中文课",
    courses: chineseCourses,
  },
  {
    id: "math",
    label: "Math 数学课",
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
    label: "Art & PE 文体课",
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
  CHN: { id: "chinese", label: "Chinese 中文课", order: 0 },
  BB: { id: "math", label: "Math 数学课", order: 1 },
  CC: { id: "arts", label: "Art&PE 文体课", order: 2 },
  SAT: { id: "sat", label: "SAT", order: 3 },
};

function Courses() {
  const [activeGroupId, setActiveGroupId] = useState(courseGroups[0].id);
  const [databaseCourses, setDatabaseCourses] = useState([]);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("classes")
      .select("id, name, teacher_short_name, classroom, donation, type, class_times(display_time)")
      .eq("is_open", true)
      .order("name")
      .then(({ data }) => setDatabaseCourses(data || []));
  }, []);

  const databaseGroups = Object.entries(
    databaseCourses.reduce((groups, course) => {
      const type = course.type || "Other";
      groups[type] = [...(groups[type] || []), [
        course.name,
        course.teacher_short_name || "",
        course.classroom || "",
        course.donation == null ? "" : `$${course.donation}`,
        course.class_times?.display_time || "",
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
    <Page eyebrow="Academics" title="课程安排 Courses">
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
            <thead><tr><th>Class Name</th><th>Teacher</th><th>Room</th><th>Donation</th><th>Time</th><th>Introduction</th></tr></thead>
            <tbody>{activeGroup.courses.map(([name, teacher, room, fee, time, file]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{teacher}</td><td>{room}</td><td>{fee}</td><td>{time}</td>
                <td>{file ? <ExternalLink href={file}>Course description</ExternalLink> : ""}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="note-box">
          <p>课程简介：点击带链接的课程名称查看。Course introduction: click a linked course title.</p>
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
    <Page eyebrow="More About" title="联系我们 Contact Us">
      <Section>
        <div className="contact-grid">
          {details.map(([label, value]) => (
            <div key={label}><span>{label}</span>{label.includes("Email") ? <a href={`mailto:${value}`}>{value}</a> : <strong>{value}</strong>}</div>
          ))}
        </div>
        <div className="action-row">
          <Link className="button-link" to="/calendar">查看校历</Link>
          <Link className="outline-link" to="/location">查看驾车路线</Link>
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
  ["从北方出发 From North", "沿 I-395 South 至 Waterford 的 CT-85 South，从出口 2 下高速，驶向 Waterford/Chesterfield。沿 CT-85 South、Cross Road 和 US-1 North/Boston Post Road 前往目的地。"],
  ["从南方或西南方向 From South/Southwest", "沿 I-95 North 往 Providence 方向行驶，在 East Lyme 的出口 75 下高速，往 Waterford 方向，沿 US-1 North/Boston Post Road 抵达目的地。"],
  ["从北方或东北方向 From North/Northeast", "沿 I-95 South 往 New Haven 方向行驶，在 Waterford 的出口 82 下高速，驶向 CT-85/Broad Street，沿 CT-85 South/Broad Street 抵达目的地。"],
];

function Location() {
  return (
    <Page eyebrow="More About" title="交通指南 Location">
      <Section>
        <div className="location-hero">
          <span>School Location</span>
          <h2>20 Rope Ferry Road<br />Waterford, CT 06385</h2>
          <p>Waterford High School · Sundays 9:30 AM – 12:45 PM</p>
          <a className="button-link" href="https://maps.google.com/?q=20+Rope+Ferry+Road+Waterford+CT+06385" target="_blank" rel="noreferrer">在地图中打开</a>
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
    <Page eyebrow="More About" title="公益服务 Community Services">
      <Section>
        <p className="lead">Community volunteer service has a long and proud history in America. SCCS students and parents have devoted countless hours to serve our community, making it a better place while becoming role models through service.</p>
      </Section>
      <div className="feature-cards">
        <article>
          <img src={`${oldSite}Images/lyme_light.jpg`} alt="Lyme Light" />
          <div><span>Student Performance Group</span><h2>The Lyme Light</h2><p>Lyme Light is a nonprofit performance group founded in March 2013 to provide community service opportunities for students. The group performs at senior centers and nursing homes throughout the region.</p><ExternalLink className="text-link" href="https://www.ctlymelight.org/">Visit Lyme Light →</ExternalLink></div>
        </article>
        <article>
          <img src={`${oldSite}Images/PresidentsVolunteerAward.jpg`} alt="President's Volunteer Service Award" />
          <div><span>Volunteer Recognition</span><h2>President's Volunteer Service Awards</h2><p>SCCS is a registered certifying organization for the President's Volunteer Service Award and can nominate eligible volunteers, verify service and distribute awards.</p><a className="text-link" href="mailto:ytu@ctsccs.org">Contact Ms. Yinyu Tu →</a></div>
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
    <Page eyebrow="More About" title="友情赞助 Proud Sponsors">
      <Section>
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
    <Page eyebrow="More About" title="中文资讯 Chinese Resources">
      <Section>
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
    <Page eyebrow="More About" title="社区链接 Community Links">
      <Section>
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
    const result = await publicSupabase?.from("feedback").insert({
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone") || null,
      message: form.get("message"),
    });
    setBusy(false);
    if (!publicSupabase) setError("Supabase is not configured.");
    else if (result.error) setError(result.error.message);
    else setSubmitted(true);
  };

  return (
    <Page eyebrow="More About" title="意见反馈 Feedback">
      <Section>
        <p className="lead">Thank you for visiting the SCCS website. If you have any difficulties, questions, ideas or suggestions, please send us a message. Your feedback helps make this site better.</p>
        {submitted ? (
          <div className="success-message"><strong>谢谢您的反馈！</strong><p>此演示站已接收表单内容。正式上线时可连接学校邮箱或后端服务。</p></div>
        ) : (
          <form className="feedback-form" onSubmit={submitFeedback}>
            <label><span>Your Name *</span><input name="name" required /></label>
            <label><span>Your Email *</span><input name="email" type="email" required /></label>
            <label><span>Your Phone</span><input name="phone" type="tel" /></label>
            <label className="full"><span>Your Comment or Questions *</span><textarea name="message" rows="7" required /></label>
            {error && <div className="form-message error">{error}</div>}
            <button className="button-link" type="submit" disabled={busy}>{busy ? "Submitting..." : "提交反馈 Submit"}</button>
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
