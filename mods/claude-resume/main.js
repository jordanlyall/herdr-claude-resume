// Claude resume: brings Claude Code chats back after a restart.
// A restart kills every program; Herdr brings each pane back as a bare shell in its last
// folder and never re-runs the command. hook.py (a Claude Code hook) keeps
// data/claude-resume/<terminal>.json = which session runs in which terminal. Once per boot,
// this types `claude --resume <id>` into each saved terminal that is live and at a shell.
// Busy terminals are left alone; entries for terminals that are gone are dropped.
// Status-bar chip: "N saved" normally, "Resumed N" after a boot pass. Click = run a pass now.
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, hc, appHome, readTextFile, shared, setShared, theme } from "herdr";
import * as fs from "fs/promises";

const DIR = () => `${appHome()}/data/claude-resume`;
const SHELLS = new Set(["zsh", "-zsh", "bash", "-bash", "fish", "-fish", "sh"]);
const BOOT_KEY = "claude-resume.boot";

const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const json = (r) => { try { return r?.code === 0 ? JSON.parse(r.stdout) : null; } catch { return null; } };

async function bootTime() {
  const r = await exec("sysctl", ["-n", "kern.boottime"]).catch(() => null);
  const m = r?.stdout.match(/sec = (\d+)/);
  if (m) return m[1];
  const up = await exec("cat", ["/proc/stat"]).catch(() => null); // Linux
  return up?.stdout.match(/btime (\d+)/)?.[1] ?? null;
}

async function entries() {
  const out = [];
  for (const f of await fs.readdir(DIR()).catch(() => [])) {
    if (!f.endsWith(".json")) continue;
    try { out.push({ term: f.slice(0, -5), file: `${DIR()}/${f}`, ...JSON.parse(await readTextFile(`${DIR()}/${f}`)) }); } catch {}
  }
  return out;
}

async function liveTerminals() {
  const ls = json(await hc(["ls", "--json"]).catch(() => null));
  if (!ls?.terminals) return null;
  return new Map(ls.terminals.filter((t) => t.state === "live").map((t) => [t.address, t]));
}

// One pass: returns what it did per terminal.
async function pass() {
  const live = await liveTerminals();
  if (!live) return null;
  const done = [];
  for (const e of await entries()) {
    const t = live.get(e.term);
    if (!/^[0-9a-f-]{36}$/i.test(e.session ?? "")) continue; // typed into a shell: ids only
    if (!t) { await fs.unlink(e.file).catch(() => {}); continue; }
    const info = json(await hc(["get", e.term, "--json"]).catch(() => null));
    const fg = info?.foreground?.name ?? "";
    if (!SHELLS.has(fg) || t.agent === "claude-code") continue;
    if (e.transcript && (await exec("test", ["-f", e.transcript]).catch(() => null))?.code !== 0) continue;
    await hc(["send", e.term, `cd ${quote(e.cwd || "~")} && claude --resume ${e.session}`]).catch(() => null);
    done.push(t.where || e.term);
  }
  return done;
}

export default class ClaudeResume extends View {
  init(_props, cx) {
    this.saved = 0; this.resumed = null; this.busy = false;
    cx.timer.every(30000, (cx) => this.count(cx));
    this.count(cx);
    cx.spawn(async (cx) => {
      const boot = await bootTime();
      if (!boot || shared(BOOT_KEY) === boot) return;
      // First start after a boot: wait for herdr-core to bring the terminals back.
      for (let i = 0; i < 60 && !(await liveTerminals())?.size; i++) await cx.sleep(2000);
      await cx.sleep(3000);
      setShared(BOOT_KEY, boot);
      await this.run(cx);
    });
  }

  count(cx) {
    cx.spawn(async (cx) => { this.saved = (await entries()).length; cx.notify(); });
  }

  async run(cx) {
    if (this.busy) return;
    this.busy = true; cx.notify();
    const done = await pass();
    this.busy = false;
    if (done) this.resumed = done;
    this.saved = (await entries()).length;
    cx.notify();
  }

  render() {
    const t = theme();
    const n = this.resumed?.length ?? 0;
    const label = this.busy ? "Resuming…" : n ? `↻ Resumed ${n}` : `↻ ${this.saved} saved`;
    const tip = n
      ? `Resumed after restart:\n${this.resumed.join("\n")}`
      : `${this.saved} Claude chat${this.saved === 1 ? "" : "s"} will come back after a restart.\nClick to resume any that are sitting at a bare shell now.`;
    return h_flex().size_full().items_center().px(8).text_size(12)
      .child(div().id("claude-resume").tooltip(tip).px(6).rounded(4).cursor_pointer()
        .text_color(n ? t.accent : t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_, cx) => cx.spawn(async (cx) => this.run(cx)))
        .child(label));
  }
}
