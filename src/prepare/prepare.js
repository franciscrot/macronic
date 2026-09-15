const $ = (id) => document.getElementById(id);
let timer;
const endpoint = "/api/projects";
const link = (text, url) => {
  const a = document.createElement("a");
  a.textContent = text;
  a.href = url;
  return a;
};
function show(project, container) {
  container.replaceChildren();
  const status = document.createElement("p");
  status.textContent = `${project.title || "Project"} · ${project.status}`;
  container.append(status);
  if (project.error) {
    const error = document.createElement("p");
    error.textContent = project.error;
    container.append(error);
  }
  if (project.status === "prepared")
    container.append(
      link("Open review workshop", `/projects/${project.id}/src/review/`),
      document.createTextNode(" · "),
      link("Test reader", `/projects/${project.id}/src/reader/`),
      document.createTextNode(" · "),
    );
  container.append(
    link("Download saved project backup", `${endpoint}/${project.id}/backup`),
  );
  if (project.log) {
    const details = document.createElement("details"),
      summary = document.createElement("summary"),
      pre = document.createElement("pre");
    summary.textContent = "Preparation log";
    pre.textContent = project.log;
    details.append(summary, pre);
    container.append(details);
  }
}
async function list() {
  const r = await fetch(endpoint);
  if (!r.ok) throw Error("Could not list local projects");
  const projects = await r.json();
  $("projects").replaceChildren();
  for (const p of projects) {
    const row = document.createElement("div");
    show(p, row);
    $("projects").append(row);
  }
}
async function poll(id) {
  clearTimeout(timer);
  try {
    const r = await fetch(`${endpoint}/${id}`);
    if (!r.ok) throw Error("Could not read preparation status");
    const p = await r.json();
    show(p, $("result"));
    if (["queued", "running"].includes(p.status))
      timer = setTimeout(() => poll(id), 1500);
    else await list();
  } catch (e) {
    $("message").textContent =
      e.message + " Reopen the local app to see your saved project.";
  }
}
async function bytes(file) {
  if (file.size > 2000000) throw Error("Each text must be at most 2 MB");
  const data = new Uint8Array(await file.arrayBuffer());
  let s = "";
  for (let i = 0; i < data.length; i += 8192)
    s += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(s);
}
$("prepare").onsubmit = async (e) => {
  e.preventDefault();
  $("inputs").disabled = true;
  $("message").textContent = "Saving your source files…";
  try {
    const f = new FormData(e.target),
      body = Object.fromEntries(f);
    body.english = await bytes(f.get("english"));
    body.translation = await bytes(f.get("translation"));
    body.sources_only = f.has("sources_only");
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const p = await r.json();
    if (!r.ok) throw Error(p.error);
    $("message").textContent =
      "Source project saved. Preparation runs on this computer.";
    await poll(p.id);
  } catch (e) {
    $("message").textContent = e.message;
  } finally {
    $("inputs").disabled = false;
  }
};
try {
  const r = await fetch("/api/info");
  const info = await r.json();
  if (!r.ok || info.local_worker !== true) throw Error();
  $("connection").textContent =
    "Connected to your local Python worker. Uploads stay on this computer.";
  $("inputs").disabled = false;
  await list();
} catch {
  $("connection").textContent =
    "This hosted page cannot run the Python models. Start the local worker, then open http://127.0.0.1:8765/ on that computer. See the beginner’s guide for setup. No files have been uploaded.";
}
