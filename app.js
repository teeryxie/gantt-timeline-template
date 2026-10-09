"use strict";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const DAY = 86400000,
  dt = (s) => new Date(s + "T00:00:00Z"),
  iso = (d) => d.toISOString().slice(0, 10);
const add = (s, n) => iso(new Date(+dt(s) + n * DAY));
const diff = (a, b) => Math.round((+dt(a) - +dt(b)) / DAY);
const today = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
}).format(new Date());
const palette = [
  "#427a70",
  "#587eaa",
  "#aa7c49",
  "#87699a",
  "#a96565",
  "#5f8390",
  "#81854d",
  "#697586",
];
let state,
  collapsed = new Set(),
  cell = 34,
  startDate = "2026-09-01",
  days = 100,
  selected = null,
  editorMode = null,
  createContext = {},
  scheduleContext = {},
  ignoreBarClickUntil = 0,
  dragNode = null,
  busy = false;
const node = (id) => state.nodes.find((n) => n.id === id);
const kids = (id) =>
  state.nodes
    .filter((n) => n.parentId === id)
    .sort((a, b) => a.order - b.order);
function descendants(id) {
  return kids(id).flatMap((n) => [n, ...descendants(n.id)]);
}
function treeRows(parent = null, depth = 0) {
  return kids(parent).flatMap((n) => [
    { n, depth },
    ...(collapsed.has(n.id) ? [] : treeRows(n.id, depth + 1)),
  ]);
}
function allRows(parent = null, depth = 0) {
  return kids(parent).flatMap((n) => [
    { n, depth },
    ...allRows(n.id, depth + 1),
  ]);
}
function toast(message, error = false) {
  $("#toast").textContent = message;
  $("#toast").className = error ? "error" : "";
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => ($("#toast").hidden = true),
    error ? 7000 : 3000,
  );
}
async function load(){const saved=localStorage.getItem("gantt-local-state");state=saved?JSON.parse(saved):{revision:0,nodes:[],members:[],history:[],user:"本地用户",supportsProgressNotes:true};$("#user").textContent=state.user;render();}
async function command(data){if(busy)return false;busy=true;try{const now=new Date().toISOString(),clone=x=>JSON.parse(JSON.stringify(x));if(data.action==="create"){const id=crypto.randomUUID(),parent=data.parentId||null,item={id,parentId:parent,name:data.name,description:data.description||"",kind:data.kind||"task",color:data.color||(node(parent)?.color||palette[0]),start:data.start,end:data.end,baselineStart:data.start,baselineEnd:data.end,createdStart:data.start,createdEnd:data.end,order:state.nodes.length,createdBy:state.user,createdAt:now,mentions:[],manualProgress:Number(data.manualProgress||0),progressMode:"manual",progress:Number(data.manualProgress||0),delay:{days:0,segments:[],shares:[]}};state.nodes.push(item);state.history.push({at:now,action:"create",nodeId:id,changes:[{id,before:null,after:clone(item)}],actor:state.user});}else if(data.action==="edit"){const n=node(data.id);if(!n)return false;const old=clone(n);Object.assign(n,{name:data.name,description:data.description,color:data.color,parentId:data.parentId||null,manualProgress:Number(data.manualProgress||0),progress:Number(data.manualProgress||0),mentions:data.mentions||[]});state.history.push({at:now,action:"edit",nodeId:n.id,changes:[{id:n.id,before:old,after:clone(n)}],actor:state.user});}else if(data.action==="delete"){const removed=[node(data.id),...descendants(data.id)];state.nodes=state.nodes.filter(n=>!removed.includes(n));state.history.push({at:now,action:"delete",nodeId:data.id,changes:removed.map(n=>({id:n.id,before:clone(n),after:null})),actor:state.user});}else if(data.action==="reschedule"){const n=node(data.id);if(n){const old=clone(n);if(data.days){const d=(data.direction==="advance"?-1:1)*Number(data.days);n.start=add(n.start,d);n.end=add(n.end,d);}else{n.start=data.start;n.end=data.end;}state.history.push({at:now,action:"reschedule",nodeId:n.id,changes:[{id:n.id,before:old,after:clone(n)}],actor:state.user});}}state.revision++;localStorage.setItem("gantt-local-state",JSON.stringify(state));render();return true;}catch(e){toast(e.message,true);return false;}finally{busy=false;$("#sync").textContent=`已保存 · 本地 r${state.revision}`;$("#save").disabled=false;}}
function calendar() {
  let out = "",
    last = "";
  for (let i = 0; i < days; i++) {
    const date = add(startDate, i),
      d = dt(date),
      month = date.slice(0, 7);
    if (month !== last) {
      out += `<span class="month" style="left:${i * cell}px">${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月</span>`;
      last = month;
    }
    if (cell >= 18 || d.getUTCDay() === 1)
      out += `<span class="day ${[0, 6].includes(d.getUTCDay()) ? "weekend" : ""} ${date === today ? "today" : ""}" style="left:${i * cell}px">${d.getUTCDate()}</span>`;
  }
  return out;
}
function segments(n) {
  return n.delay.segments
    .map((seg) => {
      const colors = seg.sources.map((id) => node(id)?.color || "#999");
      const background =
        colors.length === 1
          ? `repeating-linear-gradient(135deg,${colors[0]} 0 4px,${colors[0]}bb 4px 8px)`
          : `linear-gradient(to bottom,${colors.flatMap((c, i) => [`${c} ${(i / colors.length) * 100}%`, `${c} ${((i + 1) / colors.length) * 100}%`]).join(",")})`;
      return `<div class="delay-segment" data-open="${n.id}" style="left:${diff(seg.start, startDate) * cell}px;width:${(diff(seg.end, seg.start) + 1) * cell}px;background:${background}" title="${esc(seg.sources.map((id) => node(id)?.name).join(" / "))} · ${seg.start} 至 ${seg.end}"></div>`;
    })
    .join("");
}
function timeline(n) {
  let left = diff(n.start, startDate) * cell,
    width = (diff(n.end, n.start) + 1) * cell;
  const parent = kids(n.id).length > 0;
  const progress = n.progress ?? 0;
  const handleWidth = Math.min(8, width / 3);
  const handles = parent
    ? ""
    : ["start", "end"]
        .map(
          (edge) =>
            `<span class="resize-handle" data-resize="${edge}" data-open="${n.id}" role="button" tabindex="0" aria-label="调整${esc(n.name)}的${edge === "start" ? "开始" : "结束"}日期" title="拖动调整${edge === "start" ? "开始" : "结束"}日期" style="left:${edge === "start" ? left + 1 : left + width - handleWidth - 1}px;width:${handleWidth}px"></span>`,
        )
        .join("");
  return `<div class="baseline" style="left:${diff(n.baselineStart, startDate) * cell}px;width:${(diff(n.baselineEnd, n.baselineStart) + 1) * cell}px" title="原计划 ${n.baselineStart} 至 ${n.baselineEnd}"></div><div class="bar ${parent ? "parent-bar" : ""}" role="button" tabindex="0" data-open="${n.id}" style="left:${left}px;width:${width}px;background:${n.color}20" title="${esc(n.name)} · ${n.start} 至 ${n.end} · 进度 ${progress}% · 拖动调整时间"><span class="bar-progress-fill" style="width:${progress}%;background:${n.color}"></span><span class="bar-label">${esc(n.name)} · ${progress}%</span></div>${segments(n)}<div class="timeline-progress" role="progressbar" aria-label="${esc(n.name)}进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" style="left:${left}px;width:${width}px"><span style="width:${progress}%;background:${n.color}"></span></div>${handles}`;
}
function treeProgress(n) {
  const progress = n.progress ?? 0;
  return `<span class="tree-progress" title="${kids(n.id).length && n.progressMode !== "manual" ? "自动汇总" : "手动设置"} · ${progress}%"><span>${progress}%</span><i><b style="width:${progress}%;background:${n.color}"></b></i></span>`;
}
function siblingControls(n, detailed = false) {
  const siblings = kids(n.parentId),
    index = siblings.findIndex((item) => item.id === n.id);
  return ["up", "down"]
    .map((direction) => {
      const label = direction === "up" ? "上移" : "下移";
      const disabled =
        direction === "up" ? index === 0 : index === siblings.length - 1;
      const path =
        direction === "up" ? "M6 10V2m-4 4 4-4 4 4" : "M6 2v8m-4-4 4 4 4-4";
      return `<button type="button" class="swap-action" data-swap="${direction}" data-swap-id="${n.id}" ${disabled ? "disabled" : ""} title="${label}，与同级相邻任务交换" aria-label="${label}${esc(n.name)}">${detailed ? label : `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`}</button>`;
    })
    .join("");
}
function bindSiblingControls(scope) {
  scope.querySelectorAll("[data-swap]").forEach(
    (button) =>
      (button.onclick = async (event) => {
        event.stopPropagation();
        const n = node(button.dataset.swapId);
        if (!n) return;
        const siblings = kids(n.parentId),
          index = siblings.findIndex((item) => item.id === n.id);
        const offset = button.dataset.swap === "up" ? -1 : 1;
        if (index + offset < 0 || index + offset >= siblings.length) return;
        const beforeId =
          offset < 0 ? siblings[index - 1].id : siblings[index + 2]?.id || null;
        if (
          await command({
            action: "move",
            id: n.id,
            parentId: n.parentId,
            beforeId,
          })
        ) {
          if ($("#editor").open) {
            // Preserve any unsaved detail edits while refreshing arrow availability.
            const controls = $("#sibling-controls");
            if (controls) {
              controls.innerHTML = siblingControls(node(n.id), true);
              bindSiblingControls(controls);
            }
          }
          toast("顺序已保存");
        }
      }),
  );
}
function treeGuides(n, depth, visible) {
  const paths = [];
  const hasFollowingSibling = (item) => {
    const siblings = kids(item.parentId).filter((sibling) =>
      visible.has(sibling.id),
    );
    return siblings.at(-1)?.id !== item.id;
  };
  if (depth > 0) {
    const x = 20 + (depth - 1) * 24;
    const end = 10 + depth * 24 - 3;
    paths.push(
      `<path data-parent-link="${n.parentId}" d="M${x} 0V23H${end}m-3-3 3 3-3 3"/>`,
    );
    if (hasFollowingSibling(n)) paths.push(`<path d="M${x} 23V46"/>`);
    let ancestor = node(n.parentId),
      level = depth - 1;
    while (ancestor && level > 0) {
      if (hasFollowingSibling(ancestor)) {
        const guideX = 20 + (level - 1) * 24;
        paths.push(`<path d="M${guideX} 0V46"/>`);
      }
      ancestor = node(ancestor.parentId);
      level--;
    }
  }
  if (kids(n.id).some((child) => visible.has(child.id))) {
    paths.push(`<path d="M${20 + depth * 24} 33V46"/>`);
  }
  return `<svg class="tree-guides" width="${35 + depth * 24}" height="46" aria-hidden="true">${paths.join("")}</svg>`;
}
function render() {
  if (!state) return;
  const board = $("#board"),
    scroll = { x: board.scrollLeft, y: board.scrollTop };
  document.documentElement.style.setProperty("--cell", cell + "px");
  const term = $("#search").value.trim().toLowerCase();
  let rows = term ? allRows() : treeRows();
  if (term) {
    const match = new Set();
    state.nodes
      .filter((n) =>
        (n.name + " " + n.description).toLowerCase().includes(term),
      )
      .forEach((n) => {
        match.add(n.id);
        let p = node(n.parentId);
        while (p) {
          match.add(p.id);
          p = node(p.parentId);
        }
      });
    rows = rows.filter(({ n }) => match.has(n.id));
  }
  const latest = state.nodes.reduce(
    (max, n) => (n.end > max ? n.end : max),
    add(startDate, 90),
  );
  days = Math.min(3700, Math.max(100, diff(latest, startDate) + 20));
  const width = days * cell;
  const todayLine = `<span class="today-line" style="left:${diff(today, startDate) * cell + cell / 2}px"></span>`;
  const visible = new Set(rows.map(({ n }) => n.id));
  let html = `<div class="grid"><div class="grid-header"><div class="tree-header" id="root-drop"><b>项目 / 任务</b><span>拖到这里移至顶层</span></div><div class="calendar" style="width:${width}px">${calendar()}</div></div>`;
  for (const { n, depth } of rows) {
    const child = kids(n.id).length;
    html += `<div class="row ${n.kind === "project" ? "project" : ""} ${selected === n.id ? "selected" : ""}" data-id="${n.id}"><div class="tree-cell" data-tree="${n.id}" style="padding-left:${10 + depth * 24}px">${treeGuides(n, depth, visible)}<button class="fold" data-fold="${n.id}" aria-label="${collapsed.has(n.id) ? "展开" : "收起"} ${esc(n.name)}" ${!child ? 'style="visibility:hidden"' : ""}>${collapsed.has(n.id) ? '<svg width=12 height=12 viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>' : '<svg width=12 height=12 viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'}</button><span class="node-icon" style="color:${n.color}">${n.kind === "project" ? '<svg width=12 height=12 viewBox="0 0 16 16"><path d="M2 4h5l2 2h5v7H2z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>' : '<svg width=10 height=10><rect x=3 y=3 width=4 height=4 rx=1 fill="currentColor"/></svg>'}</span><span class="node-name" draggable="true" role="button" tabindex="0" data-open="${n.id}">${esc(n.name)}</span>${treeProgress(n)}<div class="row-actions">${siblingControls(n)}<button data-child="${n.id}" title="添加子任务" aria-label="为 ${esc(n.name)} 添加子任务">＋</button><button class="insert-action" data-insert="${n.id}" title="在下方插入同级任务" aria-label="在 ${esc(n.name)} 下方插入">≡</button></div></div><div class="track" data-track="${n.id}" style="width:${width}px">${todayLine}${timeline(n)}</div></div>`;
  }
  html += `<div class="row add-row"><div class="tree-cell"><button id="add-bottom">＋ 新建项目或任务</button></div><div class="track" data-track="" style="width:${width}px">${todayLine}<span>拖拽选择日期，新建顶层项目</span></div></div>`;
  if (!state.nodes.length)
    html += `<div class="empty-tip"><h2>从第一个项目开始</h2><p>所有项目在同一棵树中展开。<br>新建项目，或在上方空白时间线上拖出一段日期。</p><button class="primary" id="empty-create">＋ 新建项目</button></div>`;
  if (term && !rows.length)
    html += '<div class="empty-tip">没有匹配的项目或任务</div>';
  board.innerHTML = html + "</div>";
  board.scrollLeft = scroll.x;
  board.scrollTop = scroll.y;
  $("#count").textContent =
    `${state.nodes.filter((n) => n.kind === "project").length} 个项目 · ${state.nodes.filter((n) => n.kind === "task").length} 个任务`;
  $("#sync").textContent = `已保存 · r${state.revision}`;
  $("#overview").innerHTML =
    `<span class="overview-title">项目概览</span><div class="overview-items">${kids(
      null,
    )
      .map(
        (n) =>
          `<div class="overview-item" data-open="${n.id}" style="border-color:${n.color}"><strong>${esc(n.name)}</strong>${n.progress ?? 0}% · ${n.start.slice(5).replace("-", "/")} — ${n.end.slice(5).replace("-", "/")} ${n.delay.days ? `<span class="delay-text"> · 延期 ${n.delay.days} 天</span>` : ""}</div>`,
      )
      .join("")}</div>`;
  bindBoard();
}
function bindBoard() {
  bindSiblingControls($("#board"));
  document.querySelectorAll("[data-open]").forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      if (el.closest(".track") && performance.now() < ignoreBarClickUntil)
        return;
      el.dataset.resize
        ? openSchedule(el.dataset.open)
        : openEdit(el.dataset.open);
    };
    el.onkeydown = (e) => {
      if (e.key === "Enter")
        el.dataset.resize
          ? openSchedule(el.dataset.open)
          : openEdit(el.dataset.open);
    };
  });
  document.querySelectorAll("[data-fold]").forEach(
    (el) =>
      (el.onclick = () => {
        const id = el.dataset.fold;
        collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
        render();
      }),
  );
  document
    .querySelectorAll("[data-child]")
    .forEach(
      (el) => (el.onclick = () => openCreate({ parentId: el.dataset.child })),
    );
  document.querySelectorAll("[data-insert]").forEach(
    (el) =>
      (el.onclick = () => {
        const n = node(el.dataset.insert);
        openCreate({ parentId: n.parentId, afterId: n.id });
      }),
  );
  $("#add-bottom").onclick = () => openCreate();
  if ($("#empty-create"))
    $("#empty-create").onclick = () => openCreate({ kind: "project" });
  document.querySelectorAll(".node-name").forEach((el) => {
    el.ondragstart = (e) => {
      dragNode = el.dataset.open;
      e.dataTransfer.setData("text/plain", dragNode);
      e.dataTransfer.effectAllowed = "move";
    };
    el.ondragend = () => {
      dragNode = null;
      document
        .querySelectorAll(".drop-target")
        .forEach((e) => e.classList.remove("drop-target"));
    };
  });
  document.querySelectorAll("[data-tree],#root-drop").forEach((el) => {
    el.ondragover = (e) => {
      if (!dragNode) return;
      e.preventDefault();
      el.classList.add("drop-target");
    };
    el.ondragleave = () => el.classList.remove("drop-target");
    el.ondrop = async (e) => {
      e.preventDefault();
      el.classList.remove("drop-target");
      if (!dragNode) return;
      const target = el.dataset.tree || null,
        source = dragNode;
      dragNode = null;
      if (await command({ action: "move", id: source, parentId: target })) {
        if (target) collapsed.delete(target);
        render();
        toast("已调整归属");
      }
    };
  });
  document.querySelectorAll("[data-track]").forEach((track) => {
    track.onpointerdown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("[data-open]")) {
        beginScheduleDrag(e, track);
        return;
      }
      const rect = track.getBoundingClientRect(),
        anchor = Math.max(
          0,
          Math.min(days - 1, Math.floor((e.clientX - rect.left) / cell)),
        );
      let end = anchor;
      const ghost = document.createElement("div");
      ghost.className = "ghost";
      track.append(ghost);
      const update = () => {
        ghost.style.left = Math.min(anchor, end) * cell + "px";
        ghost.style.width = (Math.abs(end - anchor) + 1) * cell + "px";
      };
      update();
      track.setPointerCapture(e.pointerId);
      track.onpointermove = (ev) => {
        end = Math.max(
          0,
          Math.min(days - 1, Math.floor((ev.clientX - rect.left) / cell)),
        );
        update();
      };
      track.onpointerup = () => {
        track.onpointermove = null;
        track.onpointerup = null;
        ghost.remove();
        const current = node(track.dataset.track);
        openCreate({
          parentId: current?.id || null,
          start: add(startDate, Math.min(anchor, end)),
          end: add(startDate, Math.max(anchor, end)),
          kind: current ? "task" : "project",
        });
      };
      track.onpointercancel = () => {
        ghost.remove();
        track.onpointermove = null;
        track.onpointerup = null;
      };
    };
  });
}
function shiftedSchedule(n, delta) {
  const children = kids(n.id);
  if (!children.length)
    return { start: add(n.start, delta), end: add(n.end, delta) };
  const dates = children.map((child) => shiftedSchedule(child, delta));
  return {
    start: [n.createdStart, ...dates.map((d) => d.start)].sort()[0],
    end: [n.createdEnd, ...dates.map((d) => d.end)].sort().at(-1),
  };
}
function beginScheduleDrag(event, track) {
  const n = node(track.dataset.track);
  if (!n || busy) return;
  event.preventDefault();
  const board = $("#board"),
    edge = event.target.closest("[data-resize]")?.dataset.resize;
  const startX = event.clientX,
    initialScroll = board.scrollLeft;
  let pointerX = startX,
    moved = false,
    proposal = null,
    ghost = null,
    frame,
    finished = false;
  const leaves = [n, ...descendants(n.id)].filter(
    (item) => !kids(item.id).length,
  );
  const minDelta = Math.max(
    kids(n.id).length ? -3650 : -Infinity,
    ...leaves.map((item) => diff("2000-01-01", item.start)),
  );
  const maxDelta = Math.min(
    kids(n.id).length ? 3650 : Infinity,
    ...leaves.map((item) => diff("2100-12-31", item.end)),
  );
  const clampDate = (value) =>
    value < "2000-01-01"
      ? "2000-01-01"
      : value > "2100-12-31"
        ? "2100-12-31"
        : value;
  const update = () => {
    const distance = pointerX - startX + board.scrollLeft - initialScroll;
    if (!moved && Math.abs(distance) < 5) return;
    let delta = Math.round(distance / cell);
    if (edge === "start") {
      const start = clampDate(add(n.start, delta));
      proposal = { start: start > n.end ? n.end : start, end: n.end };
      delta = diff(proposal.start, n.start);
    } else if (edge === "end") {
      const end = clampDate(add(n.end, delta));
      proposal = { start: n.start, end: end < n.start ? n.start : end };
      delta = diff(proposal.end, n.end);
    } else {
      delta = Math.max(minDelta, Math.min(maxDelta, delta));
      proposal = { ...shiftedSchedule(n, delta), days: delta };
    }
    proposal.direction = delta > 0 ? "delay" : "advance";
    proposal.changed = delta !== 0;
    moved = true;
    if (!ghost) {
      ghost = document.createElement("div");
      ghost.className = "ghost task-preview";
      ghost.innerHTML = '<span class="drag-caption"></span>';
      track.append(ghost);
      track.classList.add("dragging-schedule");
    }
    ghost.style.left = diff(proposal.start, startDate) * cell + "px";
    ghost.style.width = (diff(proposal.end, proposal.start) + 1) * cell + "px";
    ghost.firstChild.textContent = `${proposal.start} — ${proposal.end} · ${delta >= 0 ? "+" : ""}${delta} 天`;
  };
  const autoScroll = () => {
    if (moved) {
      const rect = board.getBoundingClientRect();
      const left = rect.left + $(".tree-header").getBoundingClientRect().width;
      const speed =
        pointerX > rect.right - 28 ? 10 : pointerX < left + 28 ? -10 : 0;
      if (speed) {
        board.scrollLeft += speed;
        update();
      }
    }
    frame = requestAnimationFrame(autoScroll);
  };
  const finish = (cancelled) => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    document.removeEventListener("keydown", escape);
    track.onpointermove =
      track.onpointerup =
      track.onpointercancel =
      track.onlostpointercapture =
        null;
    if (track.hasPointerCapture(event.pointerId))
      track.releasePointerCapture(event.pointerId);
    ghost?.remove();
    track.classList.remove("dragging-schedule");
    ignoreBarClickUntil = performance.now() + 350;
    if (cancelled) return;
    if (!moved) {
      edge ? openSchedule(n.id) : openEdit(n.id);
      return;
    }
    if (proposal?.changed) openSchedule(n.id, proposal);
  };
  const escape = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish(true);
    }
  };
  document.addEventListener("keydown", escape);
  track.setPointerCapture(event.pointerId);
  track.onpointermove = (e) => {
    pointerX = e.clientX;
    update();
  };
  track.onpointerup = () => finish(false);
  track.onpointercancel = () => finish(true);
  track.onlostpointercapture = () => finish(true);
  frame = requestAnimationFrame(autoScroll);
}
function parentOptions(id, current) {
  const banned = new Set(id ? [id, ...descendants(id).map((n) => n.id)] : []);
  return (
    `<option value="">顶层</option>` +
    allRows()
      .filter(({ n }) => !banned.has(n.id))
      .map(
        ({ n, depth }) =>
          `<option value="${n.id}" ${current === n.id ? "selected" : ""}>${"　".repeat(depth)}${esc(n.name)}</option>`,
      )
      .join("")
  );
}
function field(label, input) {
  return `<label class="field"><span>${label}</span>${input}</label>`;
}
function dateFields(start, end) {
  return `<div class="two-fields">${field("开始日期", `<input type="date" name="start" min="2000-01-01" max="2100-12-31" required value="${start}">`)}${field("结束日期", `<input type="date" name="end" min="2000-01-01" max="2100-12-31" required value="${end}">`)}</div>`;
}
function openDialog(title, html) {
  $("#editor-type").textContent = title;
  $("#editor-content").innerHTML = html;
  $("#save").textContent = editorMode === "create" ? "创建" : "保存";
  $("#save").classList.toggle("danger", editorMode === "delete");
  if (!$("#editor").open) $("#editor").showModal();
  setTimeout(() => $("#editor-content input")?.focus(), 20);
}
function openCreate(context = {}) {
  editorMode = "create";
  createContext = context;
  selected = null;
  const parent = node(context.parentId);
  const start = context.start || parent?.start || today,
    end = context.end || parent?.end || add(today, 6);
  openDialog(
    "新建项目 / 任务",
    field(
      "名称",
      '<input name="name" placeholder="例如：产品上线" maxlength="160" required autocomplete="off">',
    ) +
      `<div class="two-fields">${field("类型", `<select name="kind"><option value="task" ${context.kind !== "project" ? "selected" : ""}>任务</option><option value="project" ${context.kind === "project" ? "selected" : ""}>项目</option></select>`)}${field("所属项目 / 任务", `<select name="parentId">${parentOptions(null, context.parentId)}</select>`)}</div>` +
      dateFields(start, end) +
      field(
        "简介",
        '<textarea name="description" placeholder="任务目标、交付内容或备注…" maxlength="10000"></textarea>',
      ) +
      colorField(parent?.color || palette[0]) +
      progressEditor(null) +
      `<p class="hint">父级时间会自动汇总。日期按自然日计算，包含开始日和结束日。</p>`,
  );
  bindColors();
  bindProgress();
}
function progressEditor(n) {
  const grouped = n && kids(n.id).length > 0;
  const auto = grouped && n.progressMode !== "manual";
  const progress = n?.autoProgress ?? n?.progress ?? 0;
  const manual = n?.manualProgress ?? 0;
  return (
    `<section class="progress-editor"><div class="progress-heading"><strong>进度</strong><output id="progress-value">${auto ? progress : manual}%</output></div>` +
    (grouped
      ? field(
          "计算方式",
          `<select name="progressMode"><option value="auto" ${auto ? "selected" : ""}>按子任务自动汇总</option><option value="manual" ${!auto ? "selected" : ""}>手动设置</option></select>`,
        )
      : "") +
    `<div class="manual-progress-controls" ${auto ? "hidden" : ""}><div class="progress-inputs"><input id="progress-range" type="range" min="0" max="100" step="0.1" value="${manual}" aria-label="拖动设置进度"><label><input name="manualProgress" type="number" min="0" max="100" step="0.1" value="${manual}" required aria-label="完成百分比">%</label></div><div class="progress-presets">${[0, 25, 50, 75, 100].map((p) => `<button type="button" data-progress="${p}">${p === 100 ? "已完成" : p + "%"}</button>`).join("")}</div></div>` +
    (grouped
      ? `<div class="auto-progress-details" ${!auto ? "hidden" : ""}><div class="detail-progress"><span style="width:${progress}%;background:${n.color}"></span></div><p class="hint">已完成 ${Number((n.autoCompletedDays ?? 0).toFixed(1))} / ${n.progressDays ?? 0} 个原计划任务日，按子任务时长加权。</p><ol class="progress-children">${kids(
          n.id,
        )
          .map(
            (child) =>
              `<li><span>${esc(child.name)}</span><strong>${child.progress ?? 0}%</strong></li>`,
          )
          .join(
            "",
          )}</ol></div><p class="hint">按当前任务顺序列出。中间层不重复累计；手动模式会覆盖本节点的汇总值。</p>`
      : '<p class="hint">设置当前完成比例，父级进度会自动更新。</p>') +
    field("本次进度说明（可选）", '<textarea name="progressNote" maxlength="2000" placeholder="例如：已完成接口联调，正在补充测试…"></textarea>') +
    "</section>"
  );
}
// Historical snapshots include ancestor rollups, not just the edited task.
function progressSeries(task, history, currentTime = new Date()) {
  const format = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" });
  const daily = new Map();
  const valid = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
  for (const event of [...history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const snapshot = event.changes?.find((change) => change.id === task.id)?.after;
    const at = new Date(event.at);
    if (snapshot && valid(snapshot.progress) && Number.isFinite(+at)) {
      daily.set(format.format(at), snapshot.progress);
    }
  }
  // Older snapshots may predate progress tracking; don't invent a zero baseline.
  if (valid(task.progress)) daily.set(format.format(currentTime), task.progress);
  return [...daily].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, progress]) => ({ date, progress }));
}

function progressChart(n) {
  const points = progressSeries(n, state.history);
  if (!points.length) return '<section class="progress-chart"><h3>进度趋势</h3><p class="hint">暂无已保存的进度记录。</p></section>';
  const first = points[0], last = points.at(-1);
  const span = diff(last.date, first.date);
  const x = (point) => span ? 42 + diff(point.date, first.date) / span * 280 : 182;
  const y = (point) => 140 - point.progress * 1.1;
  const path = points.map((point, i) => `${i ? "L" : "M"}${x(point)},${y(point)}`).join(" ");
  const delta = Number((last.progress - first.progress).toFixed(1));
  return `<section class="progress-chart" aria-label="进度趋势"><div class="progress-heading"><strong>进度趋势</strong><span>${span ? `较首个记录 ${delta > 0 ? "+" : ""}${delta} 个百分点` : "首个记录日"}</span></div>
    <svg viewBox="0 0 350 180" role="img" aria-label="${esc(n.name)}的进度趋势：${first.date} ${first.progress}%，至 ${last.date} ${last.progress}%">
      ${[0, 50, 100].map((value) => `<line class="chart-grid" x1="42" x2="322" y1="${140 - value * 1.1}" y2="${140 - value * 1.1}"/><text x="34" y="${144 - value * 1.1}" text-anchor="end">${value}%</text>`).join("")}
      <path class="chart-line" d="${path}"/>
      ${points.map((point) => `<circle class="chart-point" cx="${x(point)}" cy="${y(point)}" r="3" tabindex="0" aria-label="${point.date}：${point.progress}%"><title>${point.date}：${point.progress}%</title></circle>`).join("")}
      <text x="${span ? 42 : 182}" y="166" text-anchor="${span ? "start" : "middle"}">${first.date}</text>
      ${span ? `<text x="322" y="166" text-anchor="end">${last.date}</text>` : ""}
    </svg><p class="hint">按每天最后一次保存的进度绘制（上海时间），未更新时延续至今天。${span ? "" : "目前只有一天的记录，后续更新将形成折线。"}</p></section>`;
}
function bindProgress() {
  const number = $("#editor [name=manualProgress]");
  const range = $("#progress-range");
  const mode = $("#editor [name=progressMode]");
  const setValue = (value) => {
    number.value = value;
    range.value = value;
    $("#progress-value").textContent = `${value}%`;
  };
  number.oninput = () => {
    range.value = number.value;
    $("#progress-value").textContent = `${number.value}%`;
  };
  range.oninput = () => setValue(range.value);
  document
    .querySelectorAll("[data-progress]")
    .forEach(
      (button) => (button.onclick = () => setValue(button.dataset.progress)),
    );
  if (mode)
    mode.onchange = () => {
      const auto = mode.value === "auto";
      $(".manual-progress-controls").hidden = auto;
      $(".auto-progress-details").hidden = !auto;
      $("#progress-value").textContent =
        `${auto ? (node(selected).autoProgress ?? 0) : number.value}%`;
    };
}
function progressNotes(n) {
  const entries = state.history.filter((event) => event.nodeId === n.id && event.progressNote).slice().reverse();
  return `<section class="detail-section progress-notes"><h3>进度说明</h3>${entries.length ? entries.map((event) => `<div class="history-entry"><time>${new Date(event.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time><strong>${event.progressBefore}% → ${event.progressAfter}%</strong><p class="progress-note-text">${esc(event.progressNote)}</p><small>${esc(event.actor)}</small></div>`).join("") : '<p class="hint">暂无进度说明，更新进度时可以填写。</p>'}</section>`;
}
function colorField(color) {
  return field(
    "颜色",
    `<div class="color-row"><input type="color" name="color" value="${color}" aria-label="自定义颜色">${palette.map((c) => `<button type="button" class="swatch" data-color="${c}" style="background:${c}" aria-label="选择颜色 ${c}"></button>`).join("")}</div>`,
  );
}
function bindColors() {
  document
    .querySelectorAll("[data-color]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          ($("#editor input[name=color]").value = b.dataset.color)),
    );
}
function breakdown(n) {
  if (!n.delay.days) return '<p class="hint">当前结束日期未超出原计划。</p>';
  return `<h3>延期来源 · ${n.delay.days} 天</h3><div class="breakdown">${n.delay.shares.map((s) => `<span style="width:${(s.days / n.delay.days) * 100}%;background:${node(s.id).color}"></span>`).join("")}</div>${n.delay.shares.map((s) => `<div class="source-row"><span><i class="dot" style="background:${node(s.id).color}"></i>${esc(node(s.id).name)}</span><span>${Number(s.days.toFixed(1))} 天 · ${Math.round((s.days / n.delay.days) * 100)}%</span></div>`).join("")}<p class="hint">只统计超出本节点原计划的日期。同一天有多个子任务延期时均分该天，重叠天数不重复累加。</p>`;
}
function openEdit(id) {
  const n = node(id);
  if (!n) return;
  selected = id;
  editorMode = "edit";
  const hasKids = kids(id).length;
  openDialog(
    n.kind === "project" ? "项目详情" : "任务详情",
    field(
      "名称",
      `<input name="name" value="${esc(n.name)}" maxlength="160" required>`,
    ) +
      field(
        "简介",
        `<textarea name="description" maxlength="10000" placeholder="添加简介…">${esc(n.description)}</textarea>`,
      ) +
      colorField(n.color) +
      progressEditor(n) +
      progressChart(n) +
      progressNotes(n) +
      field(
        "@ 协作成员",
        `<input name="mentions" value="${esc(n.mentions.join(", "))}" list="member-list" placeholder="输入公司邮箱，多个用逗号分隔"><datalist id="member-list">${[...new Set([...state.members, state.user])].map((m) => `<option value="${esc(m)}"></option>`).join("")}</datalist>`,
      ) +
      `<p class="hint">可选择已参与协作的成员，或直接输入邮箱。这里只记录提及，不发送通知。</p>` +
      field(
        "所属项目 / 任务",
        `<select name="parentId">${parentOptions(id, n.parentId)}</select>`,
      ) +
      `<p class="hint">修改归属后，原父级与新父级的日期都会重新计算。</p><div class="meta">创建人 ${esc(n.createdBy)}<br>创建于 ${new Date(n.createdAt).toLocaleString("zh-CN")}<br>当前 ${n.start} — ${n.end}<br>原计划 ${n.baselineStart} — ${n.baselineEnd}<br>创建时计划 ${n.createdStart ?? n.baselineStart} — ${n.createdEnd ?? n.baselineEnd}</div><button type="button" class="schedule-button" id="adjust">调整时间 · 提前 / 延期</button><p class="hint">${hasKids ? "开始日期取创建时开始日期与子级最早开始的较早者；结束日期取创建时结束日期与子级最晚结束的较晚者。调整时间将整体平移后代任务，创建时日期保持不变。" : "时间变更单独记录方向、原因及调整前后日期。"}</p><div class="detail-section">${breakdown(n)}</div><div class="detail-section"><h3>最近变更</h3>${historyHTML(id, 5)}</div>`,
  );
  bindColors();
  $("#adjust").onclick = () => openSchedule(id);
  bindProgress();
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.id = "delete-task";
  deleteButton.className = "danger-text";
  deleteButton.textContent = n.kind === "project" ? "删除项目" : "删除任务";
  deleteButton.onclick = () => openDelete(id);
  $("#editor-content").append(deleteButton);
  const orderSection = document.createElement("section");
  orderSection.className = "detail-section";
  orderSection.innerHTML = `<h3>同级顺序</h3><div id="sibling-controls" class="sibling-controls">${siblingControls(n, true)}</div><p class="hint">与同一父级下相邻任务交换，子任务会随所属项目一起移动。顺序自动保存。</p>`;
  deleteButton.before(orderSection);
  bindSiblingControls(orderSection);
}
function openDelete(id) {
  const n = node(id);
  if (!n) return;
  const removed = [n, ...descendants(id)];
  selected = id;
  editorMode = "delete";
  createContext = { revision: state.revision };
  openDialog(
    "确认删除",
    `<h2 style="font-size:20px;font-weight:500">删除「${esc(n.name)}」？</h2>` +
      `<p class="hint">${removed.length > 1 ? `将一并删除其下 ${removed.length - 1} 个子节点，共 ${removed.length} 项。` : "该任务将从时间线移除。"}删除人、时间及完整内容会保留在变更记录中。</p>` +
      `<ul class="delete-list">${removed.map((item) => `<li>${esc(item.name)}<small>${item.start} — ${item.end}</small></li>`).join("")}</ul>` +
      field(
        "删除原因（可选）",
        '<textarea name="reason" maxlength="2000" placeholder="补充删除原因…"></textarea>',
      ),
  );
  $("#save").textContent = "确认删除";
}
function openSchedule(id, proposal = null) {
  const n = node(id);
  selected = id;
  editorMode = "reschedule";
  scheduleContext = { revision: state.revision };
  const parent = kids(id).length > 0;
  const direction = proposal?.direction || "delay";
  openDialog(
    "调整时间",
    `<h2 style="font-size:20px;font-weight:500">${esc(n.name)}</h2><p class="hint">调整前 ${n.start} — ${n.end}</p><div class="field"><span>调整方式</span><div class="mode-choices"><label><input type="radio" name="direction" value="advance" ${direction === "advance" ? "checked" : ""}>提前</label><label><input type="radio" name="direction" value="delay" ${direction === "delay" ? "checked" : ""}>延期</label></div></div>` +
      (parent
        ? field(
            "子任务整体平移天数",
            `<input type="number" name="days" min="1" max="3650" required value="${Math.abs(proposal?.days || 1)}">`,
          )
        : dateFields(
            proposal?.start || n.start,
            proposal?.end || add(n.end, 1),
          )) +
      '<div id="schedule-preview" class="schedule-preview" role="status"></div>' +
      field(
        "调整原因",
        '<textarea name="reason" required maxlength="2000" placeholder="说明这次调整的原因…"></textarea>',
      ) +
      `<p class="hint">${parent ? "将统一平移所有后代叶子任务。父级开始取创建时开始与子级开始的最小值，结束取创建时结束与子级结束的最大值，因此父级的最终跨度不一定整体平移。" : "按自然日调整；原计划基线保留，所有祖先节点会自动重新汇总。"}保存后记录操作人、时间、原因和调整前后日期。</p>`,
  );
  const preview = () => {
    let dates;
    if (parent) {
      const days = Number($("#editor [name=days]").value);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        $("#schedule-preview").textContent = "请输入 1–3650 的整数天数";
        return;
      }
      dates = shiftedSchedule(
        n,
        days *
          ($("#editor [name=direction]:checked").value === "delay" ? 1 : -1),
      );
    } else
      dates = {
        start: $("#editor [name=start]").value,
        end: $("#editor [name=end]").value,
      };
    $("#schedule-preview").textContent = `调整后 ${dates.start} — ${dates.end}`;
  };
  document
    .querySelectorAll(
      "#editor [name=start], #editor [name=end], #editor [name=days]",
    )
    .forEach((input) => (input.oninput = preview));
  document.querySelectorAll("[name=direction]").forEach(
    (r) =>
      (r.onchange = () => {
        if (!parent) {
          $("#editor [name=start]").value = n.start;
          $("#editor [name=end]").value = add(
            n.end,
            r.value === "delay" ? 1 : -1,
          );
        }
        preview();
      }),
  );
  preview();
}
const actionNames = {
  create: "创建",
  edit: "编辑详情",
  move: "调整归属",
  reschedule: "调整时间",
  "restore-plan": "恢复创建时计划",
  delete: "删除",
};
function historyHTML(id, limit = 100) {
  const entries = [...state.history]
    .reverse()
    .filter((h) => !id || h.nodeId === id || h.changes.some((c) => c.id === id))
    .slice(0, limit);
  return entries.length
    ? entries
        .map((h) => {
          const c = h.changes.find((c) => c.id === (id || h.nodeId));
          const moved = h.changes.find((change) => change.id === h.nodeId);
          const actionLabel =
            h.action === "move" &&
            moved?.before?.parentId === moved?.after?.parentId
              ? "调整同级顺序"
              : actionNames[h.action];
          const deleted = h.changes.filter((change) => change.after === null);
          const deletedDetails = deleted.length
            ? `<details><summary>已删除 ${deleted.length} 项 · 查看内容</summary>${deleted.map((change) => `<p><strong>${esc(change.before.name)}</strong><br>${change.before.start} — ${change.before.end}<br>${esc(change.before.description || "无简介")}<br><small>创建人 ${esc(change.before.createdBy)}${change.before.mentions.length ? ` · @ ${esc(change.before.mentions.join(", "))}` : ""}</small></p>`).join("")}</details>`
            : "";
          return `<div class="history-entry"><time>${new Date(h.at).toLocaleString("zh-CN")}</time><strong>${esc(node(h.nodeId)?.name || h.changes.find((change) => change.id === h.nodeId)?.name || c?.name)} · ${h.direction ? (h.direction === "delay" ? "延期" : "提前") : actionLabel}</strong>${h.reason ? `<p>${esc(h.reason)}</p>` : ""}${c?.before && c?.after && (c.before.start !== c.after.start || c.before.end !== c.after.end) ? `<p>${c.before.start} — ${c.before.end}<br>→ ${c.after.start} — ${c.after.end}</p>` : ""}${c?.before && c?.after && (c.before.progress ?? 0) !== (c.after.progress ?? 0) ? `<p>进度 ${c.before.progress ?? 0}% → ${c.after.progress ?? 0}%</p>` : ""}${deletedDetails}<small>${esc(h.actor)} · ${h.changes.length} 个节点变更</small></div>`;
        })
        .join("")
    : '<p class="hint">暂无变更记录</p>';
}
$("#edit-form").onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target),
    data = Object.fromEntries(form.entries());
  let ok = false;
  if (editorMode === "create") {
    ok = await command({
      action: "create",
      ...createContext,
      ...data,
      manualProgress: Number(data.manualProgress),
      parentId: data.parentId || null,
    });
  } else if (editorMode === "delete") {
    ok = await command(
      {
        action: "delete",
        id: selected,
        reason: data.reason,
        confirmSubtree: true,
      },
      createContext.revision,
    );
  } else if (editorMode === "reschedule") {
    ok = await command(
      {
        action: "reschedule",
        id: selected,
        ...data,
        ...(data.days ? { days: Number(data.days) } : {}),
      },
      scheduleContext.revision,
    );
  } else {
    const mentions = data.mentions
      .split(/[,，;；\s]+/)
      .map((s) => s.replace(/^@/, ""))
      .filter(Boolean);
    ok = await command({
      action: "edit",
      id: selected,
      parentId: data.parentId || null,
      name: data.name,
      description: data.description,
      color: data.color,
      mentions,
      manualProgress: Number(data.manualProgress),
      ...(data.progressMode ? { progressMode: data.progressMode } : {}),
      progressNote: data.progressNote,
    });
  }
  if (ok) {
    if (editorMode === "create" && data.parentId) {
      let parent = node(data.parentId);
      while (parent) {
        collapsed.delete(parent.id);
        parent = node(parent.parentId);
      }
      render();
    }
    $("#editor").close();
    toast(
      editorMode === "create"
        ? "已创建"
        : editorMode === "delete"
          ? "已删除，记录已保留"
          : "已保存",
    );
  }
};
$("#new-project").onclick = () => openCreate({ kind: "project" });
$("#close-editor").onclick = $("#cancel-editor").onclick = () =>
  $("#editor").close();
$("#refresh").onclick = load;
$("#expand").onclick = () => {
  collapsed.clear();
  render();
};
$("#collapse").onclick = () => {
  collapsed = new Set(
    state.nodes.filter((n) => kids(n.id).length).map((n) => n.id),
  );
  render();
};
$("#search").oninput = render;
$("#zoom").onchange = (e) => {
  cell = Number(e.target.value);
  render();
};
$("#today").onclick = () => {
  startDate = add(today, -7);
  render();
  $("#board").scrollLeft = 0;
};
$("#prev").onclick = () => {
  startDate = add(startDate, -28);
  render();
};
$("#next").onclick = () => {
  startDate = add(startDate, 28);
  render();
};
$("#show-history").onclick = () => {
  $("#history-content").innerHTML = historyHTML();
  $("#history-dialog").showModal();
};
$("#close-history").onclick = () => $("#history-dialog").close();
load();
